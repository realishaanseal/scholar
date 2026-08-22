import { fetchWithTimeout, safeJson } from "../http";
import { PROVIDER_MAP } from "./catalog";

/**
 * Ask each provider what it actually offers, instead of making the student
 * type a model name and find out it was wrong only when parsing fails.
 */

export type ModelOption = {
  id: string;
  label: string;
  /** Higher = better default. Cheap, fast, current models win. */
  score: number;
  note?: string;
};

/* ── Ranking ───────────────────────────────────────────────────────────────
   We want the default to be a current, cheap, fast model — the parsing job is
   small and runs on every capture, so a flagship model is wasted money.      */
function scoreModel(id: string): number {
  const m = id.toLowerCase();
  let score = 0;

  // Prefer the small/fast tiers. Parsing one homework note is a small job that
  // runs on every capture, so a flagship model is wasted money — this weight is
  // deliberately high enough to beat the "newer generation" bonus below.
  // Boundary-anchored on purpose: a bare /mini/ also matches "ge-MINI-2.5-pro",
  // which would rank Google's flagship as if it were the cheap tier.
  const tier = (words: string) => new RegExp(`(?<![a-z])(?:${words})(?![a-z])`).test(m);

  if (tier("flash|mini|haiku|instant|small|lite|8b|7b|4b|3b|1b")) score += 55;
  else if (tier("sonnet|4o|70b|32b|medium")) score += 22;
  else if (tier("pro|opus|large|405b|ultra")) score += 4;

  // Newer generations first — crude but effective across vendors.
  const gen = m.match(/(\d+)\.(\d+)/);
  if (gen) score += Math.min(parseInt(gen[1], 10) * 6 + parseInt(gen[2], 10), 30);
  else {
    const major = m.match(/[^\d](\d)(?![\d.])/);
    if (major) score += Math.min(parseInt(major[1], 10) * 5, 25);
  }
  if (/latest/.test(m)) score += 6;
  if (/:free/.test(m)) score += 12;

  // Push away anything that can't do the job.
  if (/(embed|whisper|tts|audio|image|vision-only|moderation|rerank|guard|dall|sora)/.test(m)) score -= 200;
  if (/(preview|exp|alpha|beta|nightly|thinking|reasoning)/.test(m)) score -= 10;
  if (/(0301|0314|0613|instruct-0|davinci|babbage|curie|ada)/.test(m)) score -= 60;
  if (/(gpt-3\.5|llama-2|claude-1|claude-2|gemini-1\.0|gemini-pro\b)/.test(m)) score -= 40;

  return score;
}

function toOptions(ids: string[]): ModelOption[] {
  const seen = new Set<string>();
  return ids
    .filter((id) => id && !seen.has(id) && seen.add(id))
    .map((id) => ({ id, label: id, score: scoreModel(id) }))
    .filter((m) => m.score > -100)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

async function expectOk(res: Response, label: string) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} rejected the API key (${res.status}).`);
  }
  if (res.status === 429) throw new Error(`${label} rate limit reached (429). Try again shortly.`);
  const body = (await res.text().catch(() => "")).slice(0, 200);
  throw new Error(`${label} returned ${res.status}. ${body}`);
}

export async function listModels(provider: string, apiKey: string | null): Promise<ModelOption[]> {
  const info = PROVIDER_MAP[provider];
  if (!info) throw new Error(`Unknown provider "${provider}"`);

  // OpenRouter publishes its catalogue openly, so we can show the model list
  // before the student has pasted a key — useful for deciding whether to sign up.
  const listingNeedsKey = info.needsKey && provider !== "openrouter";
  if (listingNeedsKey && !apiKey) throw new Error(`Enter an API key for ${info.label} first.`);

  switch (provider) {
    case "gemini": {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
        { timeoutMs: 20_000 }
      );
      await expectOk(res, "Gemini");
      const data = await safeJson(res);
      const ids: string[] = (data?.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name ?? "").replace(/^models\//, ""));
      return toOptions(ids);
    }

    case "anthropic": {
      const res = await fetchWithTimeout("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" },
        timeoutMs: 20_000,
      });
      await expectOk(res, "Claude");
      const data = await safeJson(res);
      return toOptions((data?.data ?? []).map((m: any) => String(m.id)));
    }

    case "openai":
    case "groq": {
      const base = provider === "openai" ? "https://api.openai.com/v1" : "https://api.groq.com/openai/v1";
      const label = provider === "openai" ? "OpenAI" : "Groq";
      const res = await fetchWithTimeout(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 20_000,
      });
      await expectOk(res, label);
      const data = await safeJson(res);
      return toOptions((data?.data ?? []).map((m: any) => String(m.id)));
    }

    case "openrouter": {
      // OpenRouter's catalogue is public, so this works even before a key is saved.
      const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models", { timeoutMs: 20_000 });
      await expectOk(res, "OpenRouter");
      const data = await safeJson(res);
      const rows: any[] = data?.data ?? [];
      const options = toOptions(rows.map((m: any) => String(m.id)));

      // Surface which ones cost nothing — that's the main reason to use OpenRouter.
      const freeIds = new Set(
        rows
          .filter((m: any) => Number(m?.pricing?.prompt ?? 1) === 0 && Number(m?.pricing?.completion ?? 1) === 0)
          .map((m: any) => String(m.id))
      );
      return options.map((o) =>
        freeIds.has(o.id) ? { ...o, note: "free", score: o.score + 15 } : o
      ).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    }

    case "ollama": {
      const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
      const res = await fetchWithTimeout(`${host}/api/tags`, { timeoutMs: 8_000 });
      await expectOk(res, "Ollama");
      const data = await safeJson(res);
      const ids = (data?.models ?? []).map((m: any) => String(m.name));
      if (ids.length === 0) {
        throw new Error(`No models pulled yet. Run: ollama pull ${info.defaultModel}`);
      }
      return toOptions(ids);
    }

    default:
      return [];
  }
}

/** The model we'd choose if the student picks "Auto". */
export function pickDefault(models: ModelOption[], provider: string): string | null {
  if (models.length === 0) return null;

  // Honour the curated suggestion when the provider actually offers it.
  // Ollama reports tags ("llama3.1:latest"), so match on the base name too.
  const base = (id: string) => id.split(":")[0];
  const info = PROVIDER_MAP[provider];

  for (const preferred of [info?.defaultModel, ...(info?.modelSuggestions ?? [])]) {
    if (!preferred) continue;
    const exact = models.find((m) => m.id === preferred);
    if (exact) return exact.id;
    const tagged = models.find((m) => base(m.id) === base(preferred));
    if (tagged) return tagged.id;
  }
  return models[0].id;
}

/* ── Auto model resolution ────────────────────────────────────────────────
   "Auto" must mean "ask the provider what exists and pick the best of it",
   NOT "use a name baked into the source". Hardcoded model names rot: vendors
   retire models, and a stale default then 404s on every single parse. This is
   exactly what happened with gemini-2.0-flash after Google shut it down.      */

type CacheEntry = { model: string | null; at: number };
const autoCache = new Map<string, CacheEntry>();
const AUTO_TTL_MS = 10 * 60 * 1000;

/** Cache key that never contains the whole secret. */
function cacheKey(provider: string, apiKey: string | null): string {
  return `${provider}:${apiKey ? apiKey.slice(-6) : "nokey"}`;
}

export function forgetAutoModel(provider: string, apiKey: string | null): void {
  autoCache.delete(cacheKey(provider, apiKey));
}

/**
 * Resolve what "Auto" means right now. Falls back to the curated default only
 * if the provider can't be reached — better a stale guess than no attempt.
 */
export async function resolveAutoModel(provider: string, apiKey: string | null): Promise<string | null> {
  const key = cacheKey(provider, apiKey);
  const hit = autoCache.get(key);
  if (hit && Date.now() - hit.at < AUTO_TTL_MS) return hit.model;

  try {
    const models = await listModels(provider, apiKey);
    const chosen = pickDefault(models, provider);
    autoCache.set(key, { model: chosen, at: Date.now() });
    return chosen;
  } catch (err) {
    console.warn(`[ai] could not list ${provider} models for Auto:`, (err as any)?.message);
    const fallback = PROVIDER_MAP[provider]?.defaultModel ?? null;
    // Cache the miss briefly so a broken key doesn't trigger a lookup per parse.
    autoCache.set(key, { model: fallback, at: Date.now() - AUTO_TTL_MS + 60_000 });
    return fallback;
  }
}
