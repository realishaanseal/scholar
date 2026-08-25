import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { resolveAIConfig } from "@/lib/settings";
import { parseTimetable } from "@/lib/documents/timetable";
import { supportsVision } from "@/lib/ai/complete";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z
  .object({
    text: z.string().max(20_000).optional(),
    image: z
      .object({
        base64: z.string().min(1).max(9_000_000),
        mimeType: z.string().regex(/^image\/(png|jpe?g|webp|gif)$/i),
      })
      .nullable()
      .optional(),
  })
  .refine((b) => Boolean(b.text?.trim()) || Boolean(b.image), {
    message: "Paste your timetable or attach a photo of it.",
  });

/**
 * Parse-only. Nothing is written here — the client shows the result for review
 * and then commits through the existing POST /api/timetable, so a bad read can
 * be corrected or abandoned without ever touching the user's schedule.
 */
export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const cfg = await resolveAIConfig(session.user.id);
  if (cfg.provider === "heuristic") {
    return NextResponse.json(
      {
        error:
          "Reading a whole timetable needs an AI provider. Add a key in Settings → AI, or add classes one at a time below.",
        needsProvider: true,
      },
      { status: 422 }
    );
  }

  const { text, image } = parsed.data;
  if (image && !supportsVision(cfg.provider)) {
    return NextResponse.json(
      {
        error:
          "Your current AI provider can't read images. Switch to Gemini, OpenAI or Claude in Settings → AI, or paste the timetable as text instead.",
      },
      { status: 422 }
    );
  }

  try {
    const result = await parseTimetable(cfg, { text, image: image ?? null });
    return NextResponse.json(result);
  } catch (err: any) {
    // The provider failing is an expected outcome here, not a server fault:
    // report it plainly so the panel can offer the manual form instead.
    return NextResponse.json(
      { error: err?.message ?? "That timetable couldn't be read.", providerFailed: true },
      { status: 502 }
    );
  }
});
