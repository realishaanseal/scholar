import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { resolveAIConfig } from "@/lib/settings";
import { supportsTranscription, transcribe } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 90;

/** 16 kHz mono WAV is ~32 KB/s, so this is roughly five minutes of speech. */
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long — try shorter bursts." }, { status: 413 });
  }
  if (file.size < 2048) {
    // Below this it's silence or a mis-fire; transcribing it wastes a call and
    // returns nonsense the student then has to delete.
    return NextResponse.json({ error: "That recording was too short to hear." }, { status: 400 });
  }

  const cfg = await resolveAIConfig(session.user.id);

  if (!supportsTranscription(cfg.provider)) {
    return NextResponse.json(
      {
        error:
          cfg.provider === "heuristic"
            ? "Dictation needs an AI provider. Add a Groq, OpenAI or Gemini key in Settings → AI."
            : `Your current provider can't transcribe audio. Switch to Groq, OpenAI or Gemini in Settings → AI.`,
        unsupported: true,
      },
      { status: 422 }
    );
  }

  try {
    const result = await transcribe(Buffer.from(await file.arrayBuffer()), cfg);

    if (!result.text) {
      return NextResponse.json({ error: "Nothing audible in that recording." }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Couldn't transcribe that.", providerFailed: true },
      { status: 502 }
    );
  }
});
