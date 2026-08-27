import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { createHomework, listSubjects, listTimetable } from "@/lib/queries";
import { resolveAIConfig } from "@/lib/settings";
import { parseHomework } from "@/lib/ai";
import { getLanguages, inputLanguageInstruction } from "@/lib/scholar/language";
import { describeScheduleForPrompt } from "@/lib/scholar/timetableSchedule";
import { bearerFrom, userIdForToken } from "@/lib/captureToken";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(3).max(8000),
  sourceUrl: z.string().max(2000).nullable().optional(),
  sourceTitle: z.string().max(300).nullable().optional(),
  nowISO: z.string().optional(),
  timezone: z.string().optional(),
});

/**
 * Capture from the browser extension.
 *
 * Authenticated by a bearer token rather than the session cookie.
 *
 * Unlike the in-app flow this saves immediately, without a review step: the
 * student is on another site and can't approve a draft they can't see. The
 * saved task is flagged in its notes as extension-captured so it's obvious in
 * the list which items still want a glance.
 */
export const POST = jsonRoute(async (req: Request) => {
  // Bearer token first: the extension can't send a session cookie (its origin is
  // chrome-extension://, and a SameSite=Lax cookie never crosses that boundary).
  const token = bearerFrom(req);
  const userId = token ? await userIdForToken(token) : (await auth())?.user?.id ?? null;

  if (!userId) {
    return cors(
      NextResponse.json(
        { error: "Paste your capture token into the extension — find it in Scholar under Settings → Preferences." },
        { status: 401 }
      )
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Nothing usable in that selection." }, { status: 400 }));
  }

  const { text, sourceUrl, sourceTitle } = parsed.data;

  // A whole-page capture is mostly navigation chrome; giving the model the page
  // title as a hint markedly improves what it picks out of the noise.
  const raw = sourceTitle && text.length > 500 ? `Page: ${sourceTitle}\n\n${text}` : text;

  const [subjects, languages, aiConfig, timetable] = await Promise.all([
    listSubjects(userId),
    getLanguages(userId),
    resolveAIConfig(userId),
    listTimetable(userId),
  ]);

  const nowISO = parsed.data.nowISO || new Date().toISOString();

  const result = await parseHomework(
    {
      raw,
      nowISO,
      timezone: parsed.data.timezone || "UTC",
      tzOffsetMinutes: 0,
      knownSubjects: subjects.map((s) => s.name),
      languageHint: inputLanguageInstruction(languages),
      scheduleContext: timetable.length ? describeScheduleForPrompt(timetable, new Date(nowISO)) : undefined,
      timetableSlots: timetable.length ? timetable : undefined,
    },
    aiConfig
  );

  const details = [result.details, sourceUrl ? `Captured from ${sourceUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const created = await createHomework({
    userId: userId,
    title: result.title,
    details,
    subject: result.subject,
    dueAt: result.dueAt,
    priority: result.priority,
    estimateMins: result.estimateMins,
    rawInput: text.slice(0, 4000),
    source: "text",
    aiConfidence: result.confidence,
    aiNotes: [result.notes, "Captured with the browser extension — worth a quick check."]
      .filter(Boolean)
      .join(" "),
  });

  return cors(
    NextResponse.json({ id: created.id, title: created.title, dueAt: created.dueAt }, { status: 201 })
  );
});

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

/**
 * The extension is a chrome-extension:// origin, which can't be enumerated
 * ahead of time. Credentials still require an exact origin echo, so this route
 * is intentionally the only one that allows a cross-origin credentialed call —
 * and it can only create homework for the already-authenticated session.
 */
function cors(res: NextResponse): NextResponse {
  // Safe to allow any origin here precisely BECAUSE this route is not
  // cookie-authenticated: without the bearer token a cross-site request gets
  // nothing, so a malicious page can't act as the signed-in student.
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}
