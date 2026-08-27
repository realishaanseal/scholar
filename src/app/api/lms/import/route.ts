import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { fetchWithTimeout } from "@/lib/http";
import { listExternalIds } from "@/lib/queries";
import { candidatesFromICS, detectPlatform, validateFeedUrl } from "@/lib/lms";
import { getLmsFeed, saveLmsFeed, clearLmsFeed } from "@/lib/settings";

/** Source tag used for every LMS ICS import, regardless of which platform was
 *  detected — platform detection is cosmetic (it only picks the instructions
 *  shown to the student); the identity a resync keys off is "this came from
 *  an LMS calendar feed," which doesn't change if detection ever does. */
const EXTERNAL_SOURCE = "lms";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ feedUrl: z.string().min(8).max(2000) });

/** Guard against a feed that redirects to something enormous. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;

/** The saved feed URL, if this student has set one up before — lets the UI
 *  restore the field on load instead of asking them to paste it every visit. */
export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const feed = await getLmsFeed(session.user.id);
  return NextResponse.json(feed);
});

/** "Change feed URL" — forgets the saved one so a new one can be pasted. */
export const DELETE = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await clearLmsFeed(session.user.id);
  return NextResponse.json({ ok: true });
});

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

  // Dedup by the ICS UID (externalId), not title — a title-based check breaks
  // the moment either side edits the title, and can't tell "already imported"
  // apart from "coincidentally worded the same." Anything already imported is
  // still worth a resync (title/details/due date may have changed on the LMS
  // side), so it's marked rather than silently dropped from the response.
  const alreadyImported = await listExternalIds(session.user.id, EXTERNAL_SOURCE);

  const withStatus = candidates.map((c) => ({ ...c, alreadyImported: alreadyImported.has(c.externalId) }));

  const platform = detectPlatform(validated.url.toString());

  // A feed that actually resolved and parsed is worth remembering — so
  // "Import from your school" doesn't ask the student to re-paste the same
  // URL on every visit. Best-effort: a save failure here shouldn't turn a
  // working preview into an error response.
  saveLmsFeed(session.user.id, parsed.data.feedUrl, platform.id).catch((err) =>
    console.error("[api/lms/import] failed to save feed URL", err)
  );

  return NextResponse.json({
    platform,
    externalSource: EXTERNAL_SOURCE,
    total: withStatus.length,
    // New items first so the common case (reviewing what's new) doesn't
    // require scrolling past everything already brought in previously.
    candidates: [...withStatus]
      .sort((a, b) => Number(a.alreadyImported) - Number(b.alreadyImported))
      .slice(0, 100),
    newCount: withStatus.filter((c) => !c.alreadyImported).length,
    resyncCount: withStatus.filter((c) => c.alreadyImported).length,
  });
});
