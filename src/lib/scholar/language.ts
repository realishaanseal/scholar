import { db, nowISO } from "../db";

/**
 * Language handling.
 *
 * Three settings, deliberately independent, because they genuinely differ in
 * practice: a student may read an English interface, type Hinglish
 * ("physics ka ch 4 friday ko submit karna hai"), and want replies in Hindi.
 * Collapsing them into one "language" setting is the mistake that makes
 * multilingual apps unusable for exactly the people who need them most.
 */

export type LanguageSettings = {
  /** Language of the UI itself. */
  interfaceLanguage: string;
  /** "auto" means: accept any language, including mixed, and don't assume. */
  inputLanguage: string;
  /** "match" means: reply in whatever language the student wrote in. */
  responseLanguage: string;
};

export const DEFAULT_LANGUAGES: LanguageSettings = {
  interfaceLanguage: "en",
  inputLanguage: "auto",
  responseLanguage: "match",
};

/**
 * Offered in the UI. Not a limit on what can be understood — input is sent to a
 * multilingual model with "auto" by default, so unlisted languages still work.
 * Adding a locale here is a one-line change and needs no code elsewhere.
 */
export const LANGUAGES: Array<{ code: string; label: string; native: string }> = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
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

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label])
);

function academicProfileDoc(userId: string) {
  return db.collection("users").doc(userId).collection("settings").doc("academicProfile");
}

export async function getLanguages(userId: string): Promise<LanguageSettings> {
  const snap = await academicProfileDoc(userId).get();
  const row = snap.exists ? (snap.data() as Partial<LanguageSettings>) : undefined;

  return {
    interfaceLanguage: row?.interfaceLanguage || DEFAULT_LANGUAGES.interfaceLanguage,
    inputLanguage: row?.inputLanguage || DEFAULT_LANGUAGES.inputLanguage,
    responseLanguage: row?.responseLanguage || DEFAULT_LANGUAGES.responseLanguage,
  };
}

export async function setLanguages(userId: string, patch: Partial<LanguageSettings>): Promise<LanguageSettings> {
  const next = { ...(await getLanguages(userId)), ...patch };

  await academicProfileDoc(userId).set(
    {
      interfaceLanguage: next.interfaceLanguage,
      inputLanguage: next.inputLanguage,
      responseLanguage: next.responseLanguage,
      updatedAt: nowISO(),
    },
    { merge: true }
  );

  return next;
}

/** Instruction appended to any prompt that produces prose for the student. */
export function languageInstruction(langs: LanguageSettings): string {
  if (langs.responseLanguage === "match") {
    return "Reply in the same language the student wrote in. If they mixed languages, reply in the dominant one.";
  }
  const name = LANGUAGE_NAMES[langs.responseLanguage] ?? langs.responseLanguage;
  return `Reply in ${name}, regardless of the language the student wrote in.`;
}

/**
 * Instruction for parsing tasks out of free text.
 *
 * The mixed-language case is called out explicitly with an example: a model told
 * only "input may be multilingual" still tends to mistranslate romanised Hindi
 * date words, and "Friday ko submit karna hai" losing its deadline is precisely
 * the failure that makes the feature worthless.
 */
export function inputLanguageInstruction(langs: LanguageSettings): string {
  const base =
    langs.inputLanguage === "auto"
      ? "The student may write in any language, and may mix two languages in one sentence (for example Hindi and English together, written in Latin script)."
      : `The student usually writes in ${
          LANGUAGE_NAMES[langs.inputLanguage] ?? langs.inputLanguage
        }, but may mix in English or other languages.`;

  return [
    base,
    'Understand the meaning regardless of script or mixture. For example "physics ka ch 4 numericals friday ko submit karna hai" means a Physics assignment, chapter 4 numericals, due Friday.',
    "Always write the extracted title and details in the student's own words where possible, but keep the subject name in the language of their existing subjects.",
  ].join(" ");
}
