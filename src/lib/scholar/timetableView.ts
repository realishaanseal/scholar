/**
 * Shared presentation helpers for the timetable views.
 *
 * The week grid on the Timetable page and the live "Classes" modal both plot
 * the same rows against the same clock, so the minute arithmetic and the
 * per-kind visual language live here rather than being restated (and drifting)
 * in each component.
 *
 * Pure — no hooks, no DOM — so it is safe to import from either a server or a
 * client component.
 */

export type ClassSlot = {
  id: string;
  title: string;
  subjectName: string | null;
  dayOfWeek: number;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  location: string | null;
  teacherName: string | null;
  kind: "class" | "break" | "library";
};

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEK_MINS = 7 * 24 * 60;

export const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes from the start of the week — used to order and compare across days. */
export const startMinsOf = (c: ClassSlot) => c.dayOfWeek * 1440 + c.startHour * 60 + c.startMin;
export const endMinsOf = (c: ClassSlot) => c.dayOfWeek * 1440 + c.endHour * 60 + c.endMin;

/** Minute-of-day only (no week offset) — what a day timeline plots against. */
export const dayStartMins = (c: ClassSlot) => c.startHour * 60 + c.startMin;
export const dayEndMins = (c: ClassSlot) => c.endHour * 60 + c.endMin;

export const durationMins = (c: ClassSlot) => Math.max(1, dayEndMins(c) - dayStartMins(c));

export function timeRange(c: ClassSlot): string {
  return `${pad(c.startHour)}:${pad(c.startMin)}–${pad(c.endHour)}:${pad(c.endMin)}`;
}

export function clockTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function untilLabel(mins: number): string {
  if (mins < 1) return "starting now";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `in ${Math.floor(mins / 1440)}d`;
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Visual identity per period kind — a class, a break, or a library period. */
export const KIND_META = {
  class: {
    label: "Class", dot: "bg-emerald-400", ring: "text-emerald-400", text: "text-emerald-300",
    glow: "bg-emerald-500/25", seg: "bg-emerald-400/70", border: "border-emerald-500/25",
    hex: "#34d399",
  },
  break: {
    label: "Break", dot: "bg-amber-400", ring: "text-amber-400", text: "text-amber-300",
    glow: "bg-amber-500/25", seg: "bg-amber-400/70", border: "border-amber-500/25",
    hex: "#fbbf24",
  },
  library: {
    label: "Library", dot: "bg-sky-400", ring: "text-sky-400", text: "text-sky-300",
    glow: "bg-sky-500/25", seg: "bg-sky-400/70", border: "border-sky-500/25",
    hex: "#38bdf8",
  },
} as const;

export function meta(kind: string) {
  return KIND_META[kind as keyof typeof KIND_META] ?? KIND_META.class;
}

/** Minute-of-week for a wall clock, matching startMinsOf/endMinsOf. */
export const nowMinsOfWeek = (now: Date) =>
  now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();

export const nowMinsOfDay = (now: Date) => now.getHours() * 60 + now.getMinutes();

export function ongoingAt(list: ClassSlot[], now: Date): ClassSlot[] {
  const m = nowMinsOfWeek(now);
  return list.filter((c) => startMinsOf(c) <= m && m < endMinsOf(c));
}

/**
 * Everything not currently running, ordered by how soon it next starts —
 * wrapping around the end of the week, so Sunday evening still surfaces
 * Monday morning rather than an empty list.
 */
export function upcomingFrom(list: ClassSlot[], now: Date): { c: ClassSlot; until: number }[] {
  const m = nowMinsOfWeek(now);
  const live = new Set(ongoingAt(list, now).map((c) => c.id));
  return list
    .filter((c) => !live.has(c.id))
    .map((c) => ({ c, until: (startMinsOf(c) - m + WEEK_MINS) % WEEK_MINS }))
    .sort((a, b) => a.until - b.until);
}

/**
 * Lay a day's periods into lanes so overlapping rows sit side by side rather
 * than on top of each other. A school timetable rarely overlaps, but an
 * imported one can, and a silently hidden class is worse than a narrow one.
 */
export function assignLanes(day: ClassSlot[]): { slot: ClassSlot; lane: number; lanes: number }[] {
  const sorted = [...day].sort((a, b) => dayStartMins(a) - dayStartMins(b));
  const laneEnds: number[] = [];
  const placed = sorted.map((slot) => {
    let lane = laneEnds.findIndex((end) => end <= dayStartMins(slot));
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = dayEndMins(slot);
    return { slot, lane };
  });
  return placed.map((p) => ({ ...p, lanes: laneEnds.length }));
}
