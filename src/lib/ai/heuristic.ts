import type { AIProvider, ParsedHomework, ParseInput } from "./types";

/**
 * Zero-dependency, zero-key fallback. Runs when no AI provider is configured
 * or when the configured provider errors out, so the app is never dead in the water.
 * It is deliberately conservative: it tidies text and extracts what it can prove.
 */

const SUBJECT_HINTS: Record<string, string[]> = {
  Mathematics: ["math", "maths", "algebra", "geometry", "calculus", "trig", "trigonometry", "arithmetic", "integration", "differentiation"],
  Physics: ["physics", "kinematics", "optics", "thermodynamics", "newton", "circuits", "electrostatics"],
  Chemistry: ["chemistry", "chem", "organic", "inorganic", "periodic table", "mole", "titration", "stoichiometry"],
  Biology: ["biology", "bio", "photosynthesis", "genetics", "cell", "anatomy", "ecology"],
  English: ["english", "essay", "literature", "poem", "grammar", "comprehension", "shakespeare", "novel"],
  History: ["history", "revolution", "world war", "civilisation", "civilization", "mughal", "medieval", "dynasty"],
  Geography: ["geography", "geo", "map work", "climate", "rivers", "tectonic", "monsoon"],
  "Computer Science": ["computer science", "cs", "coding", "programming", "python", "java", "javascript", "algorithm", "database", "sql"],
  Economics: ["economics", "eco", "demand curve", "supply curve", "microeconomics", "macroeconomics", "gdp"],
  "Social Science": ["civics", "social science", "sst", "political science"],
  Hindi: ["hindi"],
  French: ["french"],
  Spanish: ["spanish"],
  Art: ["art", "drawing", "sketch", "painting"],
};

const HIGH_SIGNALS = ["urgent", "important", "test", "exam", "graded", "asap", "must", "final", "submission", "viva", "presentation"];
const LOW_SIGNALS = ["optional", "if time", "practice", "revision", "bonus"];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const FILLER = /\b(um+|uh+|erm+|hmm+|you know|i mean|basically|actually)\b[,]?/gi;
const LEADING_FILLER = /^(?:\s*(?:so|ok(?:ay)?|right|well|like|and|yeah|alright)\b[,]?\s*)+/i;

function tidy(text: string): string {
  let t = text.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  t = t.replace(LEADING_FILLER, "").trim();
  t = t.replace(/\s+([,.!?;:])/g, "$1");
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += "";
  return t;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match, so "heart" never counts as "art". */
function mentions(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRegex(needle.toLowerCase())}\\b`).test(haystack);
}

function detectSubject(text: string, known: string[]): string {
  const lower = text.toLowerCase();

  // A subject the student already uses, named outright, always wins.
  for (const k of known) {
    if (k && mentions(lower, k)) return k;
  }

  // Then a built-in subject named outright ("history essay" is History, not English).
  for (const subject of Object.keys(SUBJECT_HINTS)) {
    if (mentions(lower, subject)) return subject;
  }

  // Finally, topic words that merely imply a subject ("photosynthesis" -> Biology).
  for (const [subject, hints] of Object.entries(SUBJECT_HINTS)) {
    if (hints.some((h) => mentions(lower, h))) return subject;
  }

  return "General";
}

/** `base` is a Date whose UTC fields hold the user's local wall clock. */
function atLocalTime(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

// "19th aug 2026" / "19 august" — day first
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\b(?:\\s*,?\\s*(\\d{4}))?`,
  "i"
);
// "aug 19th 2026" / "august 19" — month first
const MONTH_DAY = new RegExp(
  `\\b(${MONTH_NAMES})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(\\d{4}))?`,
  "i"
);

/**
 * Builds a date from a written month name, in whichever order the student wrote it.
 * `now` carries the user's local wall clock in its UTC fields (see heuristicParse).
 * With no year given, assume the next occurrence rather than a date in the past.
 */
function matchNamedDate(text: string, now: Date): Date | null {
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;

  const dm = text.match(DAY_MONTH);
  if (dm) {
    day = parseInt(dm[1], 10);
    month = MONTHS[dm[2].toLowerCase()];
    year = dm[3] ? parseInt(dm[3], 10) : undefined;
  } else {
    const md = text.match(MONTH_DAY);
    if (md) {
      month = MONTHS[md[1].toLowerCase()];
      day = parseInt(md[2], 10);
      year = md[3] ? parseInt(md[3], 10) : undefined;
    }
  }

  if (day === undefined || month === undefined) return null;
  if (day < 1 || day > 31) return null;

  const resolvedYear = year ?? now.getUTCFullYear();
  const d = new Date(Date.UTC(resolvedYear, month, day));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== month) return null; // e.g. 31 Feb

  // "aug 19" written in December means next August, not one that already passed.
  if (!year && d.getTime() < now.getTime() - 12 * 60 * 60 * 1000) {
    d.setUTCFullYear(resolvedYear + 1);
  }
  return d;
}

/** Returns a Date or null. `now` is the user's local "now". */
function detectDueDate(text: string, now: Date): Date | null {
  const lower = text.toLowerCase();

  // Explicit clock time, e.g. "by 5pm", "at 14:30"
  let hour = 9;
  let minute = 0;
  const timeMatch = lower.match(/\b(?:at|by|before)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ||
    lower.match(/\b(?:at|by|before)\s*(\d{1,2}):(\d{2})\b/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }

  if (/\btoday\b|\btonight\b/.test(lower)) return atLocalTime(now, timeMatch ? hour : 20, minute);
  if (/\btomorrow\b|\btmrw\b/.test(lower)) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return atLocalTime(d, hour, minute);
  }
  if (/\bday after tomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 2);
    return atLocalTime(d, hour, minute);
  }

  // "in 3 days" / "in 2 weeks"
  const inMatch = lower.match(/\bin (\d{1,2}) (day|days|week|weeks)\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + (inMatch[2].startsWith("week") ? n * 7 : n));
    return atLocalTime(d, hour, minute);
  }

  // weekday names, optionally "next"
  const dayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const target = WEEKDAYS.indexOf(dayMatch[2]);
    const d = new Date(now);
    let delta = (target - d.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setUTCDate(d.getUTCDate() + delta);
    return atLocalTime(d, hour, minute);
  }

  // "19th aug 2026", "19 august", "aug 19", "august 19th 2026"
  const named = matchNamedDate(lower, now);
  if (named) return atLocalTime(named, hour, minute);

  // explicit numeric date "12/09" or "12-09-2026"
  const numeric = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numeric) {
    const day = parseInt(numeric[1], 10);
    const month = parseInt(numeric[2], 10) - 1;
    let year = numeric[3] ? parseInt(numeric[3], 10) : now.getUTCFullYear();
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d.getTime())) {
      if (!numeric[3] && d.getTime() < now.getTime()) d.setUTCFullYear(year + 1);
      return atLocalTime(d, hour, minute);
    }
  }

  return null;
}

function detectPriority(text: string, due: Date | null, now: Date): "low" | "normal" | "high" {
  const lower = text.toLowerCase();
  if (LOW_SIGNALS.some((w) => mentions(lower, w))) return "low";
  if (HIGH_SIGNALS.some((w) => mentions(lower, w))) return "high";
  if (due && due.getTime() - now.getTime() < 36 * 60 * 60 * 1000) return "high";
  return "normal";
}

const MONTH_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** "due 19th aug 2026", "by august 19", "due on 19 aug" — written-out dates. */
const TRAILING_NAMED_DATE = new RegExp(
  `(?:,|\\.|;|\\s+and)?\\s+(?:it'?s\\s+)?(?:due|by|before|deadline(?: is)?|for|on)\\s+(?:on\\s+)?` +
    `(?:\\d{1,2}\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH_PATTERN})|(?:${MONTH_PATTERN})\\s+\\d{1,2}\\s*(?:st|nd|rd|th)?)` +
    `(?:\\s*,?\\s*\\d{4})?(?:\\s+(?:at|by)?\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?\\s*$`,
  "i"
);

const TRAILING_CLAUSE =
  /(?:,|\.|;|\s+and)?\s+(?:it'?s\s+)?(?:due|by|before|deadline(?: is)?|submit(?:ted)? by|for)\s+(?:on\s+)?(?:today|tonight|tomorrow|tmrw|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|in \d+ (?:day|days|week|weeks))(?:\s+(?:at|by)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\s*$/i;

/** The deadline is now its own field, so it does not need to clutter the title too. */
function stripDeadlineFromTitle(title: string): string {
  const stripped = title
    .replace(TRAILING_NAMED_DATE, "")
    .replace(TRAILING_CLAUSE, "")
    .trim()
    .replace(/[,;]+$/, "");
  return stripped.length >= 8 ? stripped : title;
}

function splitTitleAndDetails(text: string): { title: string; details: string } {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 1) {
    if (text.length <= 90) return { title: text, details: "" };
    const cut = text.lastIndexOf(" ", 85);
    return { title: text.slice(0, cut > 40 ? cut : 85).trim(), details: text.slice(cut > 40 ? cut : 85).trim() };
  }
  return { title: sentences[0].replace(/[.]$/, ""), details: sentences.slice(1).join(" ") };
}

export function heuristicParse(input: ParseInput): ParsedHomework {
  const offsetMs = (input.tzOffsetMinutes || 0) * 60 * 1000;

  // Shift into the user's local clock so "tomorrow 9am" means their 9am,
  // not the server's — then shift the answer back to real UTC.
  const nowUTC = new Date(input.nowISO);
  const nowLocal = new Date(nowUTC.getTime() + offsetMs);

  const cleaned = tidy(input.raw);
  const { title, details } = splitTitleAndDetails(cleaned);

  const dueLocal = detectDueDate(input.raw, nowLocal);
  const due = dueLocal ? new Date(dueLocal.getTime() - offsetMs) : null;

  return {
    title: stripDeadlineFromTitle(title).slice(0, 120),
    details,
    subject: detectSubject(input.raw, input.knownSubjects),
    dueAt: due ? due.toISOString() : null,
    priority: detectPriority(input.raw, due, nowUTC),
    estimateMins: null,
    confidence: 0.35,
    notes: "Parsed without an AI model — add a free API key in .env.local for much better cleanup and date handling.",
  };
}

export const heuristicProvider: AIProvider = {
  name: "heuristic",
  available: () => true,
  parse: async (input) => heuristicParse(input),
};
