/**
 * iCalendar (RFC 5545) export and import.
 *
 * Chosen as the first calendar integration precisely because it needs no OAuth,
 * no vendor account and no network: a generated .ics imports into Google
 * Calendar, Outlook and Apple Calendar alike, and a subscribed URL keeps
 * working offline. It's a real integration rather than a button that promises
 * one — see providers.ts for the hosted-sync abstraction that isn't wired yet.
 */

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  /** All-day events carry a date only. */
  start: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  /** RRULE body, e.g. "FREQ=WEEKLY;BYDAY=MO". */
  recurrence?: string;
};

const CRLF = "\r\n";

export function buildICS(events: CalendarEvent[], calendarName = "Varaxis Scholar"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Varaxis//Scholar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  // A fixed stamp for the whole file: every event sharing one DTSTAMP means
  // re-exporting unchanged data produces a byte-identical file, so calendars
  // don't treat a re-import as a batch of modifications.
  const stamp = formatUTC(new Date());

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
      const end = event.end ?? addDays(event.start, 1);
      lines.push(`DTEND;VALUE=DATE:${formatDate(end)}`);
    } else {
      lines.push(`DTSTART:${formatUTC(event.start)}`);
      // A zero-length event renders inconsistently across clients; default to 30m.
      lines.push(`DTEND:${formatUTC(event.end ?? new Date(event.start.getTime() + 30 * 60_000))}`);
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.recurrence) lines.push(`RRULE:${event.recurrence}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * RFC 5545 caps a content line at 75 octets; longer lines continue with a
 * leading space. Long assignment titles hit this constantly, and an unfolded
 * line makes some parsers drop the event entirely.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join(CRLF);
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/* ── Import ───────────────────────────────────────────────────────────────── */

export type ImportedEvent = {
  uid: string | null;
  title: string;
  description: string;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  location: string | null;
};

/**
 * Parse an .ics file into events.
 *
 * Tolerant by design: a calendar export from an unknown client should yield
 * whatever events are readable rather than failing wholesale on one malformed
 * property. Events without a usable start are dropped, not guessed at.
 */
export function parseICS(text: string): ImportedEvent[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const lines = unfolded.split("\n");

  const events: ImportedEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) {
        const event = toImported(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const rawKey = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = rawKey.split(";");

    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }

    current[name.toUpperCase()] = { value, params };
  }

  return events;
}

function toImported(
  fields: Record<string, { value: string; params: Record<string, string> }>
): ImportedEvent | null {
  const dtstart = fields["DTSTART"];
  if (!dtstart) return null;

  const allDay = dtstart.params["VALUE"] === "DATE" || /^\d{8}$/.test(dtstart.value);
  const start = parseICSDate(dtstart.value);
  if (!start) return null;

  return {
    uid: fields["UID"]?.value ?? null,
    title: unescapeText(fields["SUMMARY"]?.value ?? "").slice(0, 160) || "Untitled event",
    description: unescapeText(fields["DESCRIPTION"]?.value ?? "").slice(0, 2000),
    start,
    end: fields["DTEND"] ? parseICSDate(fields["DTEND"].value) : null,
    allDay,
    location: fields["LOCATION"] ? unescapeText(fields["LOCATION"].value).slice(0, 160) : null,
  };
}

function parseICSDate(value: string): Date | null {
  const v = value.trim();

  // Date only: 20261014
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    // Local midnight, not UTC: an all-day event on the 14th is the 14th
    // wherever the student is, and UTC parsing shifts it a day for half the world.
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  // Date-time, with or without a trailing Z: 20261014T090000Z
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dateTime) {
    const [, y, mo, d, h, mi, s, z] = dateTime;
    if (z) {
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }

  const fallback = new Date(v);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
