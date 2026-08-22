import { heuristicParse } from "./heuristic";
import { CALLERS } from "./providers";
import { PROVIDER_MAP } from "./catalog";
import { forgetAutoModel, resolveAutoModel } from "./models";
import type { AIConfig, ParsedHomework, ParseInput } from "./types";

export type ParseResult = ParsedHomework & {
  provider: string;
  degraded: boolean;
  /** Set when a configured provider failed and we fell back. */
  providerError?: string;
};

/** Env-only config, used when a user hasn't set anything of their own. */
export function envConfig(): AIConfig {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit && PROVIDER_MAP[explicit]) {
    return {
      provider: explicit,
      apiKey: envKeyFor(explicit),
      model: envModelFor(explicit),
      origin: "env",
    };
  }

  for (const id of ["gemini", "groq", "openai", "anthropic", "openrouter"]) {
    const key = envKeyFor(id);
    if (key) return { provider: id, apiKey: key, model: envModelFor(id), origin: "env" };
  }

  return { provider: "heuristic", apiKey: null, model: null, origin: "default" };
}

function envKeyFor(provider: string): string | null {
  const map: Record<string, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  return map[provider]?.trim() || null;
}

function envModelFor(provider: string): string | null {
  const map: Record<string, string | undefined> = {
    gemini: process.env.GEMINI_MODEL,
    groq: process.env.GROQ_MODEL,
    openai: process.env.OPENAI_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL,
    openrouter: process.env.OPENROUTER_MODEL,
    ollama: process.env.OLLAMA_MODEL,
  };
  return map[provider]?.trim() || null;
}

/** Run one parse through `cfg`, with no fallback. Used by the settings test button. */
export async function parseWith(input: ParseInput, cfg: AIConfig): Promise<ParsedHomework> {
  const caller = CALLERS[cfg.provider];
  if (!caller) return heuristicParse(input);

  const info = PROVIDER_MAP[cfg.provider];
  if (info?.needsKey && !cfg.apiKey) {
    throw new Error(`${info.label} needs an API key. Add one in Settings → AI.`);
  }

  // No explicit model = "Auto" = whatever the provider currently offers.
  const resolved: AIConfig = cfg.model?.trim()
    ? cfg
    : { ...cfg, model: await resolveAutoModel(cfg.provider, cfg.apiKey) };

  try {
    return await caller(input, resolved);
  } catch (err: any) {
    // If Auto picked a model the provider then rejected, our cached choice is
    // wrong — drop it so the next attempt re-detects instead of failing forever.
    if (!cfg.model?.trim() && /isn't available|not found|does not exist/i.test(err?.message ?? "")) {
      forgetAutoModel(cfg.provider, cfg.apiKey);
    }
    throw err;
  }
}

/**
 * The normal path: try the configured provider, and if anything goes wrong,
 * fall back to the offline parser rather than losing the student's input.
 */
export async function parseHomework(input: ParseInput, cfg: AIConfig): Promise<ParseResult> {
  if (cfg.provider === "heuristic" || !CALLERS[cfg.provider]) {
    return { ...heuristicParse(input), provider: "heuristic", degraded: true };
  }

  try {
    const parsed = await parseWith(input, cfg);
    return { ...parsed, provider: cfg.provider, degraded: false };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`[ai] ${cfg.provider} failed, falling back to the offline parser:`, message);

    const fallback = heuristicParse(input);
    return {
      ...fallback,
      provider: "heuristic",
      degraded: true,
      providerError: message,
      notes: `${PROVIDER_MAP[cfg.provider]?.label ?? cfg.provider} was unavailable, so this was parsed offline. ${fallback.notes}`,
    };
  }
}

export type { AIConfig, ParsedHomework, ParseInput };
