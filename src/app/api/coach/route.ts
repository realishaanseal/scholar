import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { resolveAIConfig } from "@/lib/settings";
import { buildSnapshot } from "@/lib/scholar/snapshot";
import { buildBriefing, COACH_SYSTEM } from "@/lib/coach/context";
import { completeJSON } from "@/lib/ai/complete";
import { getLanguages, languageInstruction } from "@/lib/scholar/language";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(2).max(600),
  nowISO: z.string().optional(),
  /** Prior turns, so follow-ups work. Bounded to keep the prompt small. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(8)
    .optional()
    .default([]),
});

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask me something specific." }, { status: 400 });

  const cfg = await resolveAIConfig(session.user.id);
  if (cfg.provider === "heuristic") {
    return NextResponse.json(
      {
        error: "The study coach needs an AI provider. Add a key in Settings → AI.",
        needsProvider: true,
      },
      { status: 422 }
    );
  }

  const now = parsed.data.nowISO ? new Date(parsed.data.nowISO) : new Date();
  const snapshot = await buildSnapshot(session.user.id, {
    now: Number.isNaN(now.getTime()) ? new Date() : now,
  });

  const briefing = buildBriefing({
    now: snapshot.now,
    profile: snapshot.profile,
    tasks: snapshot.tasks,
    risks: snapshot.risks,
    workload: snapshot.workload,
    recommendation: snapshot.recommendation,
    signals: snapshot.signals,
    pace: snapshot.pace,
    classesToday: snapshot.classesToday,
  });

  const languages = await getLanguages(session.user.id);

  const priorTurns = parsed.data.history
    .map((m) => `${m.role === "user" ? "Student" : "You"}: ${m.content}`)
    .join("\n");

  const user = [
    "STUDENT BRIEFING",
    "================",
    briefing,
    "",
    priorTurns ? `EARLIER IN THIS CONVERSATION:\n${priorTurns}\n` : "",
    `STUDENT'S QUESTION: ${parsed.data.question}`,
    "",
    languageInstruction(languages),
    'Reply as JSON: { "answer": string, "referencedTasks": string[] } where referencedTasks holds the exact titles of any tasks you named.',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await completeJSON<{ answer?: string; referencedTasks?: string[] }>(cfg, {
      system: COACH_SYSTEM,
      user,
      maxTokens: 1200,
    });

    const answer = String(result?.answer ?? "").trim();
    if (!answer) throw new Error("The coach returned an empty answer.");

    // Only echo back task titles that genuinely exist — this is the check that
    // catches a model inventing work the student doesn't have.
    const known = new Set(snapshot.homework.map((h) => h.title));
    const referenced = (Array.isArray(result?.referencedTasks) ? result.referencedTasks : [])
      .map((t) => String(t))
      .filter((t) => known.has(t))
      .slice(0, 8);

    return NextResponse.json({ answer: answer.slice(0, 4000), referencedTasks: referenced });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "The coach couldn't answer just now.", providerFailed: true },
      { status: 502 }
    );
  }
});
