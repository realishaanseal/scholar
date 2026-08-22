import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { fetchWithTimeout } from "@/lib/http";
import { listHomework } from "@/lib/queries";
import { candidatesFromICS, detectPlatform, validateFeedUrl } from "@/lib/lms";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ feedUrl: z.string().min(8).max(2000) });

/** Guard against a feed that redirects to something enormous. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a calendar feed URL." }, { status: 400 });

  const validated = validateFeedUrl(parsed.data.feedUrl);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  let res: Response;
  try {
    res = await fetchWithTimeout(validated.url.toString(), {
      headers: { Accept: "text/calendar, text/plain, */*" },
      timeoutMs: 30_000,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Couldn't reach that feed. ${err?.message ?? ""}`.trim() },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          res.status === 401 || res.status === 403
            ? "That feed needs authentication — make sure you copied the private/secret feed URL, not the page address."
            : `The feed returned ${res.status}.`,
      },
      { status: 502 }
    );
  }

  const text = (await res.text()).slice(0, MAX_FEED_BYTES);

  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return NextResponse.json(
      {
        error:
          "That URL didn't return a calendar. Copy the iCal/ICS feed link from your LMS rather than the calendar page URL.",
      },
      { status: 422 }
    );
  }

  const candidates = candidatesFromICS(text);

  // Titles already in Scholar, so a repeat import doesn't offer duplicates.
  const existing = new Set((await listHomework(session.user.id)).map((h) => h.title.toLowerCase()));

  return NextResponse.json({
    platform: detectPlatform(validated.url.toString()),
    total: candidates.length,
    candidates: candidates
      .filter((c) => !existing.has(c.title.toLowerCase()))
      .slice(0, 100),
    skippedExisting: candidates.filter((c) => existing.has(c.title.toLowerCase())).length,
  });
});
