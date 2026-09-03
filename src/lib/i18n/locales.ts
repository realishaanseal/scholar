/**
 * Which languages Scholar actually speaks.
 *
 * Until now fourteen were offered in the settings picker and one existed on
 * disk. Choosing Hindi produced an English interface, silently, because the
 * request config falls back when a catalogue is missing. That is worse than
 * offering English alone: it is a promise the product visibly fails to keep,
 * and the person it fails is the one who needed the translation.
 *
 * So a locale is offered only when it is finished. `status` is the gate:
 *
 *   ready   Complete and reviewed by someone who reads the language. Offered.
 *   draft   Translated but not yet reviewed. Present for testing, and not
 *           offered to anyone until a human has been through it.
 *
 * The distinction is not bureaucratic. Scholar tells students they are late,
 * tells them what a grade is, and tells them when to start work. A confident
 * mistranslation on any of those surfaces is a disciplinary problem rather
 * than a cosmetic one, so "a model produced this and nobody checked" is not
 * a state a locale gets to be in while students are reading it.
 *
 * Client-safe: no database import, so a picker can render this list without
 * dragging pg into the browser bundle.
 */

export type LocaleStatus = "ready" | "draft";

export type LocaleInfo = {
  code: string;
  /** English name, for a list an administrator reads. */
  label: string;
  /** The language's own name, for a list its speakers read. */
  native: string;
  status: LocaleStatus;
  /** Right-to-left script. */
  rtl?: boolean;
};

/**
 * Every locale with a catalogue on disk.
 *
 * A language missing from this list cannot be selected, and one marked draft
 * cannot be selected by anyone who is not deliberately testing it. Adding a
 * language means adding its catalogue and then changing one word here — in
 * that order.
 */
export const LOCALES: LocaleInfo[] = [
  { code: "en", label: "English", native: "English", status: "ready" },
  { code: "hi", label: "Hindi", native: "हिन्दी", status: "draft" },
];

/**
 * Languages that were offered before this gate existed.
 *
 * Kept as a written record rather than deleted, because the settings screen
 * has to be able to say something honest to a student who had picked one:
 * their choice is remembered, it is not available yet, and it is not a bug.
 */
export const PLANNED_LOCALES: Array<{ code: string; label: string; native: string }> = [
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
];

export const DEFAULT_LOCALE = "en";

/** Scripts that read right to left. */
export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/** Locales a person may actually choose. */
export function offeredLocales(): LocaleInfo[] {
  return LOCALES.filter((l) => l.status === "ready");
}

/** Every locale with a catalogue, draft ones included — for testing. */
export function availableLocales(): LocaleInfo[] {
  return LOCALES;
}

export function localeInfo(code: string): LocaleInfo | undefined {
  return LOCALES.find((l) => l.code === code);
}

/**
 * The locale to actually render in.
 *
 * A stored preference that is not ready resolves to English rather than
 * failing, so a student who chose Bengali last year sees a working interface
 * today. The settings screen is where they are told why, not the page they
 * happened to open.
 */
export function resolveLocale(preferred: string | null | undefined): string {
  if (!preferred) return DEFAULT_LOCALE;
  const info = localeInfo(preferred);
  return info && info.status === "ready" ? info.code : DEFAULT_LOCALE;
}

export function isRTL(code: string): boolean {
  return RTL_LOCALES.has(code);
}
