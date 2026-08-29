import { getRequestConfig } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getLanguages, LANGUAGES } from "@/lib/scholar/language";

/**
 * Scholar has no URL-based locale routing (no "/en/...", "/hi/..." prefixes) —
 * the interface language is a per-user preference stored in
 * academic_profile.interfaceLanguage (see src/lib/scholar/language.ts), read
 * here from the session on every request. Pages with no session yet (login,
 * signup, the public privacy page) fall back to English.
 */

const SUPPORTED_LOCALES = new Set(LANGUAGES.map((l) => l.code));

export const RTL_LOCALES = new Set(["ar"]);

async function resolveLocale(): Promise<string> {
  try {
    const session = await auth();
    if (!session?.user?.id) return "en";
    const langs = await getLanguages(session.user.id);
    return SUPPORTED_LOCALES.has(langs.interfaceLanguage) ? langs.interfaceLanguage : "en";
  } catch {
    // auth() or the DB call can fail during edge/middleware-adjacent renders
    // (e.g. no DB configured yet in a fresh checkout) — English is always
    // safe to fall back to since messages/en.json always exists.
    return "en";
  }
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
