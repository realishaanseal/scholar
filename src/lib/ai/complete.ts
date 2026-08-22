import { PROVIDER_MAP } from "./catalog";
import { extractJSON } from "./normalize";
import { forgetAutoModel, resolveAutoModel } from "./models";
import { fetchWithTimeout } from "../http";
import type { AIConfig } from "./types";

/**
 * Generic "give me JSON back" call, across every provider dialect.
 *
 * The existing CALLERS in providers.ts are hard-wired to the homework-parsing
 * prompt and return a ParsedHomework. Assignment analysis and syllabus planning
 * need the same transport with different prompts and schemas, so this layer
 * carries an arbitrary prompt — and optionally an image — through the same four
 * dialects rather than duplicating each vendor's request shape.
 */

export type ImageInput = { base64: string; mimeType: string };

export type CompleteOptions = {
  system: string;
  user: string;
  image?: ImageInput | null;
  /** Larger ceiling than task parsing: syllabi produce long structured output. */
  maxTokens?: number;
};

/** Providers that can accept an image alongside the prompt. */
const VISION_CAPABLE = new Set(["gemini", "openai", "anthropic", "openrouter"]);

export function supportsVision(provider: string): boolean {
  return VISION_CAPABLE.has(provider);
}

export class VisionUnsupportedError extends Error {
  constructor(provider: string) {
    const label = PROVIDER_MAP[provider]?.label ?? provider;
    super(
      `${label} can't read images. Switch to Gemini, OpenAI or Claude in Settings → AI to analyse photos and scans.`
    );
    this.name = "VisionUnsupportedError";
  }
}

/** Resolve Auto → a live model, then dispatch. Mirrors parseWith's retry contract. */
export async function completeJSON<T = any>(cfg: AIConfig, options: CompleteOptions): Promise<T> {
  const info = PROVIDER_MAP[cfg.provider];
  if (info?.needsKey && !cfg.apiKey) {
    throw new Error(`${info.label} needs an API key. Add one in Settings → AI.`);
  }
  if (options.image && !supportsVision(cfg.provider)) {
    throw new VisionUnsupportedError(cfg.provider);
  }

  const model = cfg.model?.trim() || (await resolveAutoModel(cfg.provider, cfg.apiKey));
  const resolved: AIConfig = { ...cfg, model };

  try {
    return await dispatch<T>(resolved, options);
  } catch (err: any) {
    if (!cfg.model?.trim() && /isn't available|not found|does not exist/i.test(err?.message ?? "")) {
      forgetAutoModel(cfg.provider, cfg.apiKey);
    }
    throw err;
  }
}

async function dispatch<T>(cfg: AIConfig, o: CompleteOptions): Promise<T> {
  switch (cfg.provider) {
    case "gemini": return geminiJSON<T>(cfg, o);
    case "anthropic": return anthropicJSON<T>(cfg, o);
    case "openai":
    case "groq":
    case "openrouter": return openaiJSON<T>(cfg, o);
    case "ollama": return ollamaJSON<T>(cfg, o);
    default: throw new Error(`${cfg.provider} can't be used for document analysis.`);
  }
}

function modelOf(cfg: AIConfig): string {
  const m = cfg.model?.trim() || PROVIDER_MAP[cfg.provider]?.defaultModel || "";
  if (!m) throw new Error(`No model set for ${cfg.provider}. Choose one in Settings → AI.`);
  return m;
}

async function fail(res: Response, label: string, model: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 400);
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} rejected the API key (${res.status}). Check it in Settings → AI.`);
  }
  if (res.status === 429) {
    throw new Error(`${label} rate limit reached (429). Wait a moment or switch provider.`);
  }
  if (res.status === 404 || /model.*(not found|does not exist|invalid)/i.test(body)) {
    throw new Error(`"${model}" isn't available on this ${label} key. Try Model → Auto in Settings → AI.`);
  }
  if (res.status >= 500) throw new Error(`${label} is having problems right now (${res.status}).`);
  throw new Error(`${label} error ${res.status}: ${body}`);
}

/* ── Gemini ────────────────────────────────────────────────────────────── */
async function geminiJSON<T>(cfg: AIConfig, o: CompleteOptions): Promise<T> {
  const model = modelOf(cfg);
  const parts: any[] = [{ text: o.user }];
  if (o.image) {
    parts.unshift({ inline_data: { mime_type: o.image.mimeType, data: o.image.base64 } });
  }

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          maxOutputTokens: o.maxTokens ?? 8192,
        },
      }),
      timeoutMs: 90_000,
    }
  );

  if (!res.ok) await fail(res, "Gemini", model);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return extractJSON(text) as T;
}

/* ── Anthropic ─────────────────────────────────────────────────────────── */
async function anthropicJSON<T>(cfg: AIConfig, o: CompleteOptions): Promise<T> {
  const model = modelOf(cfg);
  const content: any[] = [];
  if (o.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: o.image.mimeType, data: o.image.base64 },
    });
  }
  content.push({ type: "text", text: o.user });

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: o.maxTokens ?? 8192,
        temperature: 0.2,
        system: o.system,
        messages: [{ role: "user", content }],
      }),
      timeoutMs: 90_000,
    }
  );

  if (!res.ok) await fail(res, "Claude", model);
  const data = await res.json();
  const text = (data?.content ?? []).map((b: any) => b.text ?? "").join("");
  return extractJSON(text) as T;
}

/* ── OpenAI-compatible ─────────────────────────────────────────────────── */
const OPENAI_TARGETS: Record<string, { url: string; label: string; headers?: Record<string, string> }> = {
  openai: { url: "https://api.openai.com/v1/chat/completions", label: "OpenAI" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", label: "Groq" },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    label: "OpenRouter",
    headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Varaxis Scholar" },
  },
};

async function openaiJSON<T>(cfg: AIConfig, o: CompleteOptions): Promise<T> {
  const target = OPENAI_TARGETS[cfg.provider];
  const model = modelOf(cfg);

  const userContent: any = o.image
    ? [
        { type: "text", text: o.user },
        { type: "image_url", image_url: { url: `data:${o.image.mimeType};base64,${o.image.base64}` } },
      ]
    : o.user;

  const res = await fetchWithTimeout(
    target.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(target.headers ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: o.maxTokens ?? 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: o.system },
          { role: "user", content: userContent },
        ],
      }),
      timeoutMs: 90_000,
    }
  );

  if (!res.ok) await fail(res, target.label, model);
  const data = await res.json();
  return extractJSON(data?.choices?.[0]?.message?.content ?? "") as T;
}

/* ── Ollama (local, text only) ─────────────────────────────────────────── */
async function ollamaJSON<T>(cfg: AIConfig, o: CompleteOptions): Promise<T> {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const model = modelOf(cfg);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${host}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          options: { temperature: 0.2 },
          messages: [
            { role: "system", content: o.system },
            { role: "user", content: o.user },
          ],
        }),
        timeoutMs: 120_000,
      }
    );
  } catch (err: any) {
    throw new Error(`Could not reach Ollama at ${host}. Is the Ollama app running?`);
  }

  if (!res.ok) await fail(res, "Ollama", model);
  const data = await res.json();
  return extractJSON(data?.message?.content ?? "") as T;
}
