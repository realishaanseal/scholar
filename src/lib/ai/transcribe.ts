import { PROVIDER_MAP } from "./catalog";
import { fetchWithTimeout } from "../http";
import type { AIConfig } from "./types";

/**
 * Server-side speech-to-text.
 *
 * The browser's own SpeechRecognition works only in Google-branded Chrome and
 * Edge — it streams audio to Google's servers, so Brave, ungoogled Chromium,
 * Firefox and Safari all fail it (usually with a bare "network" error). This
 * path records locally and transcribes through whichever provider the student
 * has already configured, so dictation works in every browser.
 *
 * Audio arrives as 16 kHz mono WAV (see lib/audio/wav.ts) because that is the
 * one format accepted by all three provider dialects.
 */

export type TranscriptionResult = { text: string; provider: string; model: string };

/** Providers that can turn speech into text. */
const TRANSCRIBE_CAPABLE = new Set(["groq", "openai", "gemini"]);

export function supportsTranscription(provider: string): boolean {
  return TRANSCRIBE_CAPABLE.has(provider);
}

export class TranscriptionUnsupportedError extends Error {
  constructor(provider: string) {
    const label = PROVIDER_MAP[provider]?.label ?? provider;
    super(
      `${label} can't transcribe audio. Switch to Groq, OpenAI or Gemini in Settings → AI to dictate, or type instead.`
    );
    this.name = "TranscriptionUnsupportedError";
  }
}

export async function transcribe(audio: Buffer, cfg: AIConfig): Promise<TranscriptionResult> {
  if (!supportsTranscription(cfg.provider)) throw new TranscriptionUnsupportedError(cfg.provider);

  const info = PROVIDER_MAP[cfg.provider];
  if (info?.needsKey && !cfg.apiKey) {
    throw new Error(`${info.label} needs an API key. Add one in Settings → AI.`);
  }

  switch (cfg.provider) {
    case "groq": return groqTranscribe(audio, cfg);
    case "openai": return openaiTranscribe(audio, cfg);
    case "gemini": return geminiTranscribe(audio, cfg);
    default: throw new TranscriptionUnsupportedError(cfg.provider);
  }
}

/*
  Dedicated speech models, not the chat model the student picked — transcription
  is a separate endpoint with its own model family on both Groq and OpenAI.
*/
const GROQ_MODEL = "whisper-large-v3-turbo";
const OPENAI_MODEL = "gpt-transcribe";

async function groqTranscribe(audio: Buffer, cfg: AIConfig): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "speech.wav");
  form.append("model", GROQ_MODEL);
  form.append("response_format", "json");

  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    timeoutMs: 60_000,
  });

  if (!res.ok) await fail(res, "Groq");
  const data = await res.json();
  return { text: String(data?.text ?? "").trim(), provider: "groq", model: GROQ_MODEL };
}

async function openaiTranscribe(audio: Buffer, cfg: AIConfig): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "speech.wav");
  form.append("model", OPENAI_MODEL);

  const res = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    timeoutMs: 60_000,
  });

  if (!res.ok) await fail(res, "OpenAI");
  const data = await res.json();
  return { text: String(data?.text ?? "").trim(), provider: "openai", model: OPENAI_MODEL };
}

/**
 * Gemini has no separate transcription endpoint — audio goes to generateContent
 * inline, alongside an instruction. WAV is required here: Gemini's inline audio
 * accepts wav/mp3/ogg/flac/aac/aiff and rejects the webm MediaRecorder emits.
 */
async function geminiTranscribe(audio: Buffer, cfg: AIConfig): Promise<TranscriptionResult> {
  const model = cfg.model?.trim() || PROVIDER_MAP.gemini?.defaultModel || "gemini-flash-latest";

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "audio/wav", data: audio.toString("base64") } },
              {
                text:
                  "Transcribe this audio exactly as spoken. Return only the transcript text, " +
                  "with no commentary, labels or quotation marks. If nothing is audible, return an empty string.",
              },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      timeoutMs: 60_000,
    }
  );

  if (!res.ok) await fail(res, "Gemini");
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

  return { text: cleanTranscript(text), provider: "gemini", model };
}

/**
 * A chat model asked to transcribe sometimes wraps the result in quotes or
 * prefixes it with "Transcript:", despite being told not to. Strip that so the
 * homework parser doesn't treat the preamble as part of the assignment.
 */
function cleanTranscript(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(transcript|transcription)\s*:\s*/i, "");
  if (text.length > 1 && /^["'“”]/.test(text) && /["'“”]$/.test(text)) {
    text = text.slice(1, -1);
  }
  return text.trim();
}

async function fail(res: Response, label: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 300);

  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} rejected the API key. Check it in Settings → AI.`);
  }
  if (res.status === 413) {
    throw new Error("That recording is too long. Try again in shorter bursts.");
  }
  if (res.status === 429) {
    throw new Error(`${label} rate limit reached. Wait a moment and try again.`);
  }
  if (res.status >= 500) {
    throw new Error(`${label} is having problems right now (${res.status}).`);
  }
  throw new Error(`${label} couldn't transcribe that (${res.status}): ${body}`);
}
