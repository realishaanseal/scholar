import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { resolveAIConfig } from "@/lib/settings";
import { extractNoticeItems, noticeExternalId } from "@/lib/documents/notice";
import { listExternalIds } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Distinct from the ICS importer's "lms" tag — these ids are a hash of the
 *  extracted text, not a calendar UID, and the two schemes must never be
 *  compared against each other as if they were the same identity space. */
const EXTERNAL_SOURCE = "lms-notice";

const Body = z.object({ text: z.string().min(8).max(20_000) });

/**
 * Read a pasted school notice / homework-diary email and return candidate
 * homework items, in the same shape the ICS calendar-feed importer produces
 * — so the client can show both through one review-and-select list. Parse
 * only: nothing is written until the student commits through
 * POST /api/homework/bulk, same as every other import path in the app.
 */
export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste the notice or email text first." }, { status: 400 });
  }

  const cfg = await resolveAIConfig(session.user.id);
  if (cfg.provider === "heuristic") {
    return NextResponse.json(
      {
        error:
          "Reading a notice needs an AI provider. Add a key in Settings → AI, or use a calendar feed URL instead.",
        needsProvider: true,
      },
      { status: 422 }
    );
  }

  let extraction;
  try {
    extraction = await extractNoticeItems(cfg, { text: parsed.data.text, nowISO: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "That notice couldn't be read.", providerFailed: true },
      { status: 502 }
    );
  }

  const alreadyImported = await listExternalIds(session.user.id, EXTERNAL_SOURCE);

  const candidates = extraction.items.map((item) => {
    const externalId = noticeExternalId(item);
    return {
      externalId,
      title: item.title,
      details: item.details,
      dueAt: item.dueAt,
      subject: item.subject,
      // Everything here already passed the "is this actually homework" filter
      // inside the prompt itself, unlike the ICS path which sees every
      // calendar event and has to guess — so every item defaults selected.
      looksLikeAssignment: true,
      alreadyImported: alreadyImported.has(externalId),
    };
  });

  return NextResponse.json({
    externalSource: EXTERNAL_SOURCE,
    total: candidates.length,
    candidates: [...candidates].sort((a, b) => Number(a.alreadyImported) - Number(b.alreadyImported)),
    newCount: candidates.filter((c) => !c.alreadyImported).length,
    resyncCount: candidates.filter((c) => c.alreadyImported).length,
    warnings: extraction.warnings,
  });
});
