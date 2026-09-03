import { DEFAULT_LOCALE } from "./locales";

/**
 * Every number, date and list Scholar renders.
 *
 * One module because the alternative is what was here before: eight
 * components calling toLocaleDateString with their own options, about thirty
 * places writing `n === 1 ? "piece" : "pieces"` inline, and no way to change
 * how a date reads without finding all of them.
 *
 * The plural problem is the one that actually blocks translation. English has
 * two forms and the codebase encoded that assumption in control flow rather
 * than in strings — which means a translator never sees it, because it is not
 * a string. Arabic has six forms, Polish four, Japanese one. `plural()` here
 * takes the forms a language needs and picks with Intl.PluralRules, so the
 * ternaries can go.
 *
 * Everything is pure and takes an explicit locale. No module-level "current
 * locale" state: a server rendering two students' pages in one process must
 * not have them share a setting.
 */

/* ── Numbers ───────────────────────────────────────────────────────────── */

export function formatNumber(
  n: number,
  locale: string = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions = {}
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(n);
  } catch {
    return String(n);
  }
}

/**
 * A percentage, as a grade is written.
 *
 * Takes a number already on a 0–100 scale rather than a fraction, because
 * that is what the gradebook computes and converting twice is how a grade
 * ends up a hundred times too small.
 */
export function formatPercent(
  value: number,
  locale: string = DEFAULT_LOCALE,
  fractionDigits = 0
): string {
  return formatNumber(value / 100, locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/* ── Durations ─────────────────────────────────────────────────────────── */

/**
 * Minutes, as a person would say them.
 *
 * Not Intl.DurationFormat: it is too new to rely on across the browsers a
 * school actually runs, and this needs to work on a five-year-old Chromebook.
 * The unit words come from the caller's translation function so this stays
 * translatable without importing one.
 */
export function formatDuration(
  mins: number,
  locale: string = DEFAULT_LOCALE,
  units: { hr: string; min: string } = { hr: "hr", min: "min" }
): string {
  const total = Math.max(0, Math.round(mins));
  if (total < 60) return `${formatNumber(total, locale)} ${units.min}`;

  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0
    ? `${formatNumber(h, locale)} ${units.hr}`
    : `${formatNumber(h, locale)} ${units.hr} ${formatNumber(m, locale)} ${units.min}`;
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

export type DateStyle = "date" | "dateTime" | "time" | "weekdayDate" | "monthDay";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  dateTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
  weekdayDate: { weekday: "long", day: "numeric", month: "short" },
  monthDay: { day: "numeric", month: "short" },
};

export function formatDate(
  value: Date | string,
  locale: string = DEFAULT_LOCALE,
  style: DateStyle = "date",
  timeZone?: string
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      ...DATE_OPTIONS[style],
      ...(timeZone ? { timeZone } : {}),
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * "3 days ago", "in 2 hours".
 *
 * Intl.RelativeTimeFormat rather than hand-built strings, because the rules
 * for this differ far more between languages than they appear to — some
 * inflect the unit by number, some by direction, and English's "1 day ago"
 * versus "yesterday" is a choice other languages make differently.
 */
export function formatRelative(
  value: Date | string,
  locale: string = DEFAULT_LOCALE,
  now: Date = new Date()
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const diffMs = d.getTime() - now.getTime();
  const abs = Math.abs(diffMs);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    for (const [unit, ms] of units) {
      if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
    }
    return rtf.format(0, "minute");
  } catch {
    return formatDate(d, locale, "dateTime");
  }
}

/* ── Plurals ───────────────────────────────────────────────────────────── */

export type PluralForms = Partial<
  Record<Intl.LDMLPluralRule, string>
> & { other: string };

/**
 * Pick the right plural form for a count.
 *
 * The forms a language needs are its own business — English wants `one` and
 * `other`, Arabic wants six, Japanese wants one — so callers supply what
 * their catalogue holds and `other` is the required fallback. A language that
 * asks for a form the catalogue does not have gets `other` rather than
 * undefined, which is wrong-sounding rather than broken.
 *
 * `#` in the chosen form is replaced by the formatted count, so a translator
 * can put the number where their language puts it rather than where English
 * does.
 */
export function plural(
  count: number,
  forms: PluralForms,
  locale: string = DEFAULT_LOCALE
): string {
  let rule: Intl.LDMLPluralRule = "other";
  try {
    rule = new Intl.PluralRules(locale).select(count);
  } catch {
    rule = count === 1 ? "one" : "other";
  }
  const form = forms[rule] ?? forms.other;
  return form.replace(/#/g, formatNumber(count, locale));
}

/* ── Lists ─────────────────────────────────────────────────────────────── */

/**
 * "a, b and c" — with the conjunction and the commas the language uses.
 *
 * Joining with ", " and appending " and " is an English habit that reads as
 * broken in most other languages.
 */
export function formatList(
  items: string[],
  locale: string = DEFAULT_LOCALE,
  type: "conjunction" | "disjunction" = "conjunction"
): string {
  if (items.length === 0) return "";
  try {
    return new Intl.ListFormat(locale, { style: "long", type }).format(items);
  } catch {
    return items.join(", ");
  }
}

/* ── Collation ─────────────────────────────────────────────────────────── */

/**
 * Compare two names the way the reader's language orders them.
 *
 * JavaScript's default comparator sorts by code point, which puts "Ödegaard"
 * after "Zulu" in Norwegian and produces meaningless order for any CJK list.
 * A roster is one of the few places where sort order is the whole point.
 */
export function collator(locale: string = DEFAULT_LOCALE): Intl.Collator {
  try {
    return new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
}

export function compareNames(a: string, b: string, locale: string = DEFAULT_LOCALE): number {
  return collator(locale).compare(a, b);
}
