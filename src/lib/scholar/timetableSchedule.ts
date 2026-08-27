import type { TimetableSlotDTO } from "../clientTypes";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One occurrence of a timetable slot on a specific calendar date, with its
 * "period number" for that day — the 1st, 2nd, 3rd... period a student would
 * count off, in schedule order including breaks and library time. This is
 * what lets "3rd period tomorrow" and "next chem class" both resolve against
 * a real schedule instead of the AI (or heuristic parser) having to guess.
 */
export type ScheduleOccurrence = {
  slot: TimetableSlotDTO;
  /** The actual calendar date this occurrence falls on. */
  date: Date;
  /** 1-based position within that day's schedule (classes, breaks, library — everything). */
  periodNumber: number;
  /** Minutes from `now` until this occurrence starts. Negative if already started/passed. */
  startsInMins: number;
};

/** `now` should carry the user's local wall-clock in its UTC fields, matching
 *  the convention already used by the heuristic parser (see heuristic.ts). */
function startOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Expands the (weekly, recurring) timetable into concrete occurrences across
 * `daysAhead` calendar days starting today, in chronological order. Each
 * occurrence carries its period number within that day, so "3rd period" and
 * "next <subject> class/lab" can both be resolved by simple lookups.
 */
export function expandSchedule(
  slots: TimetableSlotDTO[],
  now: Date,
  daysAhead = 8
): ScheduleOccurrence[] {
  if (slots.length === 0) return [];

  const dayStart = startOfLocalDay(now);
  const byDayOfWeek = new Map<number, TimetableSlotDTO[]>();
  for (const s of slots) {
    const arr = byDayOfWeek.get(s.dayOfWeek) ?? [];
    arr.push(s);
    byDayOfWeek.set(s.dayOfWeek, arr);
  }
  for (const arr of byDayOfWeek.values()) {
    arr.sort((a, b) => a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin));
  }

  const out: ScheduleOccurrence[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(dayStart);
    date.setUTCDate(date.getUTCDate() + i);
    const dow = date.getUTCDay();
    const daySlots = byDayOfWeek.get(dow) ?? [];

    daySlots.forEach((slot, idx) => {
      const occurrenceStart = new Date(date);
      occurrenceStart.setUTCHours(slot.startHour, slot.startMin, 0, 0);
      out.push({
        slot,
        date: occurrenceStart,
        periodNumber: idx + 1,
        startsInMins: Math.round((occurrenceStart.getTime() - now.getTime()) / 60000),
      });
    });
  }

  return out;
}

/**
 * A compact, human-readable rendering of the upcoming timetable for the AI
 * prompt — grouped by day, each period numbered, so the model can resolve
 * "next chem lab", "3rd period tomorrow", "period after lunch" etc. directly
 * against real rows instead of inventing a date. Kept short: only the next
 * `daysAhead` days, one line per period.
 */
export function describeScheduleForPrompt(
  slots: TimetableSlotDTO[],
  now: Date,
  daysAhead = 8
): string {
  if (slots.length === 0) return "(no timetable set up)";

  const occurrences = expandSchedule(slots, now, daysAhead);
  if (occurrences.length === 0) return "(timetable set up, but nothing scheduled in the next week)";

  const dayStart = startOfLocalDay(now);
  const lines: string[] = [];
  let lastDateKey = "";

  for (const occ of occurrences) {
    const dateKey = occ.date.toISOString().slice(0, 10);
    if (dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      const dayIndex = Math.floor((occ.date.getTime() - dayStart.getTime()) / 86_400_000);
      const dayLabel =
        dayIndex === 0 ? "Today" : dayIndex === 1 ? "Tomorrow" : WEEKDAYS[occ.date.getUTCDay()];
      lines.push(`${dayLabel} (${dateKey}):`);
    }

    const { slot, periodNumber } = occ;
    const time = `${pad(slot.startHour)}:${pad(slot.startMin)}-${pad(slot.endHour)}:${pad(slot.endMin)}`;
    const subjectPart = slot.subjectName && slot.subjectName !== slot.title ? ` [${slot.subjectName}]` : "";
    const kindPart = slot.kind !== "class" ? ` (${slot.kind})` : "";
    const locPart = slot.location ? ` @ ${slot.location}` : "";
    lines.push(`  P${periodNumber} ${time} ${slot.title}${subjectPart}${kindPart}${locPart}`);
  }

  return lines.join("\n");
}

/** True if `text` mentions the subject/title of this slot in a whole-word way. */
function slotMatchesQuery(slot: TimetableSlotDTO, needleLower: string): boolean {
  const haystack = `${slot.title} ${slot.subjectName ?? ""}`.toLowerCase();
  return haystack.includes(needleLower);
}

/**
 * Best-effort, non-AI resolution of phrases like "next chem class", "next
 * chemistry lab", or "next period" against the expanded schedule — used by
 * the offline heuristic parser so it isn't strictly worse than the AI path
 * when no provider is configured or the provider call fails.
 *
 * Returns the matching occurrence (date AND the timetable slot itself, so a
 * caller can also borrow its subject), or null if nothing in `text` looks
 * like this kind of reference, or nothing upcoming matches.
 */
export function resolveTimetableReference(
  text: string,
  slots: TimetableSlotDTO[],
  now: Date
): ScheduleOccurrence | null {
  const lower = text.toLowerCase();
  const occurrences = expandSchedule(slots, now, 14).filter((o) => o.startsInMins >= -5);
  if (occurrences.length === 0) return null;

  // "3rd period [today|tomorrow]" / "period 3 tomorrow" / "3rd period"
  const periodMatch = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s*period\b(?:\s+(today|tomorrow|tmrw))?|\bperiod\s*(\d{1,2})\b(?:\s+(today|tomorrow|tmrw))?/
  );
  if (periodMatch) {
    const n = parseInt(periodMatch[1] ?? periodMatch[3], 10);
    const when = periodMatch[2] ?? periodMatch[4];
    const dayStart = startOfLocalDay(now);
    let targetDayIndex = 0;
    if (when === "tomorrow" || when === "tmrw") targetDayIndex = 1;
    else if (!when) {
      // Bare "3rd period" with no day word: prefer today's if it hasn't
      // passed yet, otherwise the next day that has one.
      const todays = occurrences.find(
        (o) => o.periodNumber === n && Math.floor((o.date.getTime() - dayStart.getTime()) / 86_400_000) === 0
      );
      if (todays) return todays;
      targetDayIndex = -1; // signal "search forward" below
    }

    if (targetDayIndex >= 0) {
      const match = occurrences.find(
        (o) => o.periodNumber === n && Math.floor((o.date.getTime() - dayStart.getTime()) / 86_400_000) === targetDayIndex
      );
      if (match) return match;
    } else {
      const match = occurrences.find((o) => o.periodNumber === n);
      if (match) return match;
    }
  }

  // "next <subject> class" / "next <subject> lab" / "next chem lab" / "next chemistry"
  const nextMatch = lower.match(/\bnext\s+([a-z][a-z .&-]{1,30}?)\s*(?:class|lab|lesson|period)?\b/);
  if (nextMatch) {
    const needle = nextMatch[1].trim();
    if (needle && !["period", "class", "week", "day", "month", "time"].includes(needle)) {
      const wantsLab = /\blab\b/.test(lower);
      const candidates = occurrences.filter((o) => slotMatchesQuery(o.slot, needle));
      const filtered = wantsLab
        ? candidates.filter((o) => /\blab\b/i.test(`${o.slot.title} ${o.slot.location ?? ""}`))
        : candidates;
      const pick = (filtered.length ? filtered : candidates)[0];
      if (pick) return pick;
    }
  }

  return null;
}
