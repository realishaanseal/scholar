/**
 * The provider catalog. Safe to import from client components —
 * it contains no keys and no server-only code.
 */

export type ProviderId =
  | "gemini"
  | "groq"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "ollama"
  | "heuristic";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  vendor: string;
  /** Short, honest description of the trade-off. */
  blurb: string;
  /** Where to actually get the key. */
  keyUrl?: string;
  keyUrlLabel?: string;
  docsUrl?: string;
  defaultModel: string;
  modelSuggestions: string[];
  needsKey: boolean;
  cost: "free" | "free-tier" | "paid" | "local";
  /**
   * Known prefixes a valid key can start with — used for a soft warning only.
   * Never a hard block: vendors change key formats (Google moved from AIza to
   * AQ. in 2026) and a stale check that calls a valid key "wrong" is worse
   * than no check at all.
   */
  keyPrefixes?: string[];
  accent: string;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    vendor: "Google AI Studio",
    blurb:
      "Generous free tier and strong at pulling structure out of messy notes. The best starting point for most people.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    // Only a seed for the very first call — "Auto" re-detects from the live list.
    defaultModel: "gemini-flash-latest",
    modelSuggestions: ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"],
    needsKey: true,
    cost: "free-tier",
    // AQ. is Google's current format from AI Studio; AIza is the legacy one.
    keyPrefixes: ["AQ.", "AIza"],
    accent: "#4285F4",
  },
  {
    id: "groq",
    label: "Groq",
    vendor: "Groq Cloud",
    blurb:
      "Free tier and by far the fastest — parses in well under a second. Runs open models like Llama.",
    keyUrl: "https://console.groq.com/keys",
    keyUrlLabel: "console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs",
    defaultModel: "llama-3.3-70b-versatile",
    modelSuggestions: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    needsKey: true,
    cost: "free-tier",
    keyPrefixes: ["gsk_"],
    accent: "#f55036",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    vendor: "OpenRouter",
    blurb:
      "One key, hundreds of models from every vendor. Several are genuinely free — handy for trying models side by side.",
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "openrouter.ai/keys",
    docsUrl: "https://openrouter.ai/docs",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    modelSuggestions: [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct",
      "anthropic/claude-3.5-haiku",
      "openai/gpt-4o-mini",
    ],
    needsKey: true,
    cost: "free-tier",
    keyPrefixes: ["sk-or-"],
    accent: "#8b5cf6",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    vendor: "OpenAI Platform",
    blurb:
      "Excellent quality and very reliable structured output. Pay as you go — a homework parse costs a fraction of a cent.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs",
    defaultModel: "gpt-4o-mini",
    modelSuggestions: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"],
    needsKey: true,
    cost: "paid",
    keyPrefixes: ["sk-"],
    accent: "#10a37f",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    vendor: "Anthropic Console",
    blurb:
      "Strongest at careful rewriting — it keeps your meaning intact instead of paraphrasing it away. Pay as you go.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "console.anthropic.com/settings/keys",
    docsUrl: "https://docs.claude.com",
    defaultModel: "claude-haiku-4-5",
    modelSuggestions: ["claude-haiku-4-5", "claude-3-5-haiku-latest", "claude-sonnet-4-5"],
    needsKey: true,
    cost: "paid",
    keyPrefixes: ["sk-ant-"],
    accent: "#d97757",
  },
  {
    id: "ollama",
    label: "Ollama",
    vendor: "Runs on this computer",
    blurb:
      "Completely offline and free forever — nothing leaves your machine. Needs the Ollama app installed and a model pulled.",
    keyUrl: "https://ollama.com/download",
    keyUrlLabel: "ollama.com/download",
    docsUrl: "https://github.com/ollama/ollama",
    defaultModel: "llama3.1",
    modelSuggestions: ["llama3.1", "qwen2.5", "mistral"],
    needsKey: false,
    cost: "local",
    accent: "#e5e7eb",
  },
  {
    id: "heuristic",
    label: "Built-in offline parser",
    vendor: "No AI, no key",
    blurb:
      "Always available fallback. Handles common deadline phrases and subjects, but won't rewrite messy notes well.",
    defaultModel: "—",
    modelSuggestions: [],
    needsKey: false,
    cost: "free",
    accent: "#64748b",
  },
];

export const PROVIDER_MAP: Record<string, ProviderInfo> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p])
);

export const COST_LABEL: Record<ProviderInfo["cost"], string> = {
  free: "Free",
  "free-tier": "Free tier",
  paid: "Paid",
  local: "Local",
};
