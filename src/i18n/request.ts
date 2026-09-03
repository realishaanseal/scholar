import { getRequestConfig } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getLanguages } from "@/lib/scholar/language";
import { DEFAULT_LOCALE, resolveLocale } from "@/lib/i18n/locales";

/**
 * Which language to render this request in.
 *
 * Scholar has no URL-based locale routing — no "/en/…", "/hi/…" prefixes. The
 * interface language is a per-user preference read from the session, because
 * a student's language is a property of the student rather than of the page
 * they are on, and a shared link should open in the reader's language rather
 * than the sender's.
 *
 * A stored preference that has no finished catalogue resolves to English
 * rather than falling through to a missing file. That used to happen silently
 * for thirteen of the fourteen languages on offer; now the resolution is
 * explicit and the settings screen explains it.
 */
async function currentLocale(): Promise<string> {
  try {
    const session = await auth();
    if (!session?.user?.id) return DEFAULT_LOCALE;
    const langs = await getLanguages(session.user.id);
    return resolveLocale(langs.interfaceLanguage);
  } catch {
    // auth() or the database can be unavailable during an edge-adjacent
    // render, or on a fresh checkout with no database configured. English is
    // always safe: its catalogue is the one that always exists.
    return DEFAULT_LOCALE;
  }
}

export default getRequestConfig(async () => {
  const locale = await currentLocale();

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return { locale, messages };
});
