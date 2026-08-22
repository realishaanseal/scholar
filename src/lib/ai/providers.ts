import type { AIConfig, ParsedHomework, ParseInput } from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { extractJSON, normalizeParsed } from "./normalize";
import { PROVIDER_MAP } from "./catalog";
import { fetchWithTimeout } from "../http";

/**
 * Every hosted provider speaks one of three dialects. Rather than a file per
 * vendor, we have one adapter per dialect and a small table mapping providers
 * onto them — adding a new OpenAI-compatible vendor is then a one-line change.
 */

export type ProviderCall = (input: ParseInput, cfg: AIConfig) => Promise<ParsedHomework>;

function modelFor(cfg: AIConfig): string {
  const model = cfg.model?.trim() || PROVIDER_MAP[cfg.provider]?.defaultModel || "";
  if (!model) throw new Error(`No model set for ${cfg.provider}. Choose one in Settings → AI.`);
  return model;
}

async function readError(res: Response, label: string, model?: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 400);

  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} rejected the API key (${res.status}). Check it in Settings → AI.`);
  }
  if (res.status === 429) {
    throw new Error(`${label} rate limit reached (429). Wait a moment or switch provider in Settings → AI.`);
  }

  // A 404 from a chat endpoint almost always means the model name doesn't exist.
  // Say that plainly instead of echoing the provider's JSON at the student.
  if (res.status === 404 || /model.*(not found|does not exist|invalid)/i.test(body)) {
    const named = model ? `"${model}"` : "That model";
    throw new Error(
      `${named} isn't available on this ${label} key. Hit “Detect models” to see what is, or switch Model back to Auto.`
    );
  }

  if (res.status >= 500) {
    throw new Error(`${label} is having problems right now (${res.status}). Try again shortly.`);
  }

  throw new Error(`${label} error ${res.status}: ${body}`);
}

/* ── Google Gemini ─────────────────────────────────────────────────────── */
export const callGemini: ProviderCall = async (input, cfg) => {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelFor(cfg)}:generateContent?key=${cfg.apiKey}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) await readError(res, "Gemini", modelFor(cfg));
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return normalizeParsed(extractJSON(text), input.raw);
};

/* ── Anthropic Claude ──────────────────────────────────────────────────── */
export const callAnthropic: ProviderCall = async (input, cfg) => {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelFor(cfg),
      max_tokens: 1024,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    }),
  });

  if (!res.ok) await readError(res, "Claude", modelFor(cfg));
  const data = await res.json();
  const text = (data?.content ?? []).map((b: any) => b.text ?? "").join("");
  return normalizeParsed(extractJSON(text), input.raw);
};

/* ── OpenAI-compatible (OpenAI, Groq, OpenRouter) ──────────────────────── */
const OPENAI_COMPATIBLE: Record<string, { url: string; label: string; headers?: Record<string, string> }> = {
  openai: { url: "https://api.openai.com/v1/chat/completions", label: "OpenAI" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", label: "Groq" },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    label: "OpenRouter",
    headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Varaxis Scholar" },
  },
};

export const callOpenAICompatible: ProviderCall = async (input, cfg) => {
  const target = OPENAI_COMPATIBLE[cfg.provider];
  if (!target) throw new Error(`Unknown provider "${cfg.provider}"`);

  const res = await fetchWithTimeout(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(target.headers ?? {}),
    },
    body: JSON.stringify({
      model: modelFor(cfg),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!res.ok) await readError(res, target.label, modelFor(cfg));
  const data = await res.json();
  return normalizeParsed(extractJSON(data?.choices?.[0]?.message?.content ?? ""), input.raw);
};

/* ── Ollama (local) ────────────────────────────────────────────────────── */
export const callOllama: ProviderCall = async (input, cfg) => {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

  let res: Response;
  try {
    res = await fetchWithTimeout(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelFor(cfg),
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });
  } catch (err: any) {
    throw new Error(`Could not reach Ollama at ${host}. Is the Ollama app running? (${err?.message ?? "no response"})`);
  }

  if (!res.ok) await readError(res, "Ollama", modelFor(cfg));
  const data = await res.json();
  return normalizeParsed(extractJSON(data?.message?.content ?? ""), input.raw);
};

export const CALLERS: Record<string, ProviderCall> = {
  gemini: callGemini,
  anthropic: callAnthropic,
  openai: callOpenAICompatible,
  groq: callOpenAICompatible,
  openrouter: callOpenAICompatible,
  ollama: callOllama,
};
