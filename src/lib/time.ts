/**
 * Deadlines, said unambiguously.
 *
 * A deadline is one instant and two sentences. The instant is what the server
 * compares against and is never in doubt. The sentences are what a person
 * reads, and there are two of them because a teacher in Mumbai writing
 * "Friday 23:59" and a student on exchange in Berlin reading it are not
 * describing the same moment in the same words — 23:59 IST is 20:29 CEST, and
 * a student shown only their own clock will believe the rule is different from
 * what their teacher set.
 *
 * So both are shown, and which is which is labelled. The institution's time is
 * the rule; the reader's time is when the rule bites for them. Neither alone
 * is sufficient: the reader's alone loses the rule, and the institution's
 * alone asks a fifteen-year-old to do timezone arithmetic under pressure.
 *
 * Pure, and free of any database import. Everything here is Intl plus
 * arithmetic, so it is testable without a running system and safe to import
 * from a client component.
 */

/** A deadline as it should be presented to one particular reader. */
export type DeadlineView = {
  /** The moment itself, unambiguous and machine-comparable. */
  instant: string;
  /** How the institution that set it would say it. */
  institution: { text: string; zone: string; abbrev: string };
  /** How the reader's own clock says it. */
  viewer: { text: string; zone: string; abbrev: string };
  /**
   * True when the two sentences differ and both are worth showing. False when
   * the reader is in the institution's zone, which is almost everyone almost
   * all of the time — and showing the same time twice would be noise.
   */
  differs: boolean;
  /** True when the deadline falls on a different calendar day for the reader. */
  crossesDay: boolean;
};

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Resolve a zone that might be missing, unknown, or a lie.
 *
 * An invalid IANA name does not fail where it is set — it fails much later,
 * inside a formatter, while rendering somebody's deadline. Falling back here
 * means a bad zone shows the wrong label rather than throwing a blank page at
 * a student the night something is due.
 */
export function safeZone(zone: string | null | undefined, fallback = "UTC"): string {
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/** The short name a zone goes by on a given date — "IST", "CEST", "GMT+8". */
export function zoneAbbrev(instant: Date, zone: string, locale = "en"): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(instant);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

function render(instant: Date, zone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...DATE_PARTS, timeZone: zone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat(locale, DATE_PARTS).format(instant);
  }
}

function dayKey(instant: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Present one deadline to one reader.
 *
 * `differs` is computed by rendering the same instant in both zones and
 * comparing the result, rather than by comparing the zone names. Two names can
 * be different strings and the same clock — Europe/Dublin and Europe/London
 * agree for most of the year, and telling a student in Dublin that their
 * London school's deadline is "also 23:59 your time" is noise dressed as
 * helpfulness.
 */
export function deadlineView(
  instant: Date | string,
  institutionZone: string | null | undefined,
  viewerZone: string | null | undefined,
  locale = "en"
): DeadlineView {
  const at = instant instanceof Date ? instant : new Date(instant);

  const iZone = safeZone(institutionZone);
  // A reader with no zone of their own is treated as being where their
  // institution is, which is true of almost everyone and produces one
  // sentence instead of two.
  const vZone = safeZone(viewerZone, iZone);

  const iText = render(at, iZone, locale);
  const vText = render(at, vZone, locale);

  return {
    instant: at.toISOString(),
    institution: { text: iText, zone: iZone, abbrev: zoneAbbrev(at, iZone, locale) },
    viewer: { text: vText, zone: vZone, abbrev: zoneAbbrev(at, vZone, locale) },
    differs: iText !== vText,
    crossesDay: dayKey(at, iZone) !== dayKey(at, vZone),
  };
}

/**
 * One line a student can act on.
 *
 * The reader's own time leads, because that is the one they will plan against.
 * The institution's follows in parentheses when it differs, because that is
 * the one they will be held to. A day difference is called out in words —
 * "the day before, where you are" is the sentence that prevents somebody
 * handing in a day late while believing they were early.
 */
export function deadlineSentence(view: DeadlineView): string {
  if (!view.differs) return `Due ${view.institution.text}`;

  const base = `Due ${view.viewer.text} your time (${view.institution.text} ${view.institution.abbrev})`;
  return view.crossesDay ? `${base} — a different day where you are` : base;
}

/**
 * Turn a wall-clock time a teacher typed into the instant it means.
 *
 * A `datetime-local` input has no zone attached; the browser's own offset is
 * not the right one, because the rule belongs to the institution rather than
 * to wherever the teacher happens to be sitting. A teacher setting Friday
 * 23:59 from an airport in Singapore is setting 23:59 at their school.
 *
 * Implemented by formatting a guess in the target zone and correcting by the
 * error, which handles DST without a dependency: the first guess can be off by
 * an hour across a transition, and the second pass lands on the right instant.
 */
export function wallClockToInstant(local: string, zone: string): Date {
  const z = safeZone(zone);

  // Parsed field by field rather than with `new Date(local)`, which reads a
  // zoneless string as the *runner's* local time. That makes the answer depend
  // on where the server happens to be, which is exactly the bug this function
  // exists to prevent — and it hides itself when the server and the school are
  // in the same zone.
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local.trim());
  if (!m) return new Date(NaN);

  // The typed wall clock, read as if it were UTC. The real instant is this
  // minus whatever the target zone was offset by at that moment.
  const asUTC = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0)
  );
  if (Number.isNaN(asUTC)) return new Date(NaN);

  const offsetAt = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: z,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUTC = Date.UTC(
      get("year"), get("month") - 1, get("day"),
      get("hour") % 24, get("minute"), get("second")
    );
    return asUTC - d.getTime();
  };

  // Two passes. The first offset is measured at the wrong instant and can be
  // an hour out across a DST transition; measuring again at the corrected
  // instant lands on the right one.
  const first = new Date(asUTC - offsetAt(new Date(asUTC)));
  return new Date(asUTC - offsetAt(first));
}
