import { db } from "../db";

/**
 * Personal analytics, derived entirely from recorded completions.
 *
 * Every figure here is a description of what happened, not a prediction. Where
 * a number is inherently uncertain (estimate accuracy from a handful of
 * sessions) the sample size travels with it so the UI can qualify it — a
 * confident-looking statistic built on three data points is misinformation.
 */

export type SubjectStat = {
  subject: string;
  sessions: number;
  averageActualMins: number;
  estimatedMins: number;
  actualMins: number;
  onTimeRate: number;
  /** Present only when enough paired estimate/actual data exists to mean anything. */
  accuracy: number | null;
};

export type WeekPoint = {
  /** ISO date of the Monday starting this week. */
  weekStart: string;
  label: string;
  completed: number;
  minutes: number;
  onTime: number;
};

export type AnalyticsSummary = {
  totalSessions: number;
  /** Sessions that recorded a measured duration — the basis for timing stats. */
  timedSessions: number;
  totalMinutes: number;
  onTimeRate: number;
  /** actual ÷ estimated across all paired sessions; null when there's no basis. */
  accuracy: number | null;
  averageTaskMins: number;
  subjects: SubjectStat[];
  weeks: WeekPoint[];
  /** Change in on-time rate, latest 4 weeks vs the 4 before. Null if too little data. */
  onTimeTrend: number | null;
};

type EventRow = {
  subjectName: string;
  estimateMins: number | null;
  actualMins: number | null;
  onTime: number;
  completedAt: string;
};

/** Minimum paired sessions before an accuracy figure is worth showing at all. */
const MIN_ACCURACY_SAMPLE = 3;

export async function buildAnalytics(userId: string, weeks = 12, now = new Date()): Promise<AnalyticsSummary> {
  const rows = (await db
    .prepare(
      `SELECT subjectName, estimateMins, actualMins, onTime, completedAt
         FROM task_events
        WHERE userId = ?
        ORDER BY completedAt ASC`
    )
    .all(userId)) as EventRow[];

  const timed = rows.filter((r) => r.actualMins && r.actualMins > 0);
  const paired = rows.filter((r) => r.estimateMins && r.estimateMins > 0 && r.actualMins && r.actualMins > 0);

  const totalMinutes = timed.reduce((n, r) => n + (r.actualMins ?? 0), 0);
  const sumEstimate = paired.reduce((n, r) => n + (r.estimateMins ?? 0), 0);
  const sumActual = paired.reduce((n, r) => n + (r.actualMins ?? 0), 0);

  return {
    totalSessions: rows.length,
    timedSessions: timed.length,
    totalMinutes,
    onTimeRate: rows.length ? rows.filter((r) => r.onTime === 1).length / rows.length : 1,
    accuracy: paired.length >= MIN_ACCURACY_SAMPLE && sumEstimate > 0 ? sumActual / sumEstimate : null,
    averageTaskMins: timed.length ? Math.round(totalMinutes / timed.length) : 0,
    subjects: bySubject(rows),
    weeks: byWeek(rows, weeks, now),
    onTimeTrend: trend(rows, now),
  };
}

function bySubject(rows: EventRow[]): SubjectStat[] {
  const map = new Map<string, EventRow[]>();
  for (const r of rows) {
    const list = map.get(r.subjectName) ?? [];
    list.push(r);
    map.set(r.subjectName, list);
  }

  const out: SubjectStat[] = [];
  for (const [subject, list] of map) {
    const timed = list.filter((r) => r.actualMins && r.actualMins > 0);
    const paired = list.filter((r) => r.estimateMins && r.estimateMins > 0 && r.actualMins && r.actualMins > 0);

    const estimatedMins = paired.reduce((n, r) => n + (r.estimateMins ?? 0), 0);
    const actualMins = paired.reduce((n, r) => n + (r.actualMins ?? 0), 0);
    const totalActual = timed.reduce((n, r) => n + (r.actualMins ?? 0), 0);

    out.push({
      subject,
      sessions: list.length,
      averageActualMins: timed.length ? Math.round(totalActual / timed.length) : 0,
      estimatedMins,
      actualMins,
      onTimeRate: list.filter((r) => r.onTime === 1).length / list.length,
      accuracy:
        paired.length >= MIN_ACCURACY_SAMPLE && estimatedMins > 0 ? actualMins / estimatedMins : null,
    });
  }

  return out.sort((a, b) => b.sessions - a.sessions);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Monday-based: getDay() is 0 for Sunday, which would otherwise start the
  // week on the wrong day for most of the world's school calendars.
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function byWeek(rows: EventRow[], weeks: number, now: Date): WeekPoint[] {
  const buckets = new Map<string, WeekPoint>();

  // Seed every week in range so quiet weeks render as genuine zeros rather than
  // vanishing — a gap in a trend line reads as "no data", which is a different claim.
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const start = startOfWeek(d);
    const key = start.toISOString().slice(0, 10);
    buckets.set(key, {
      weekStart: key,
      label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      completed: 0,
      minutes: 0,
      onTime: 0,
    });
  }

  for (const r of rows) {
    const at = new Date(r.completedAt);
    if (Number.isNaN(at.getTime())) continue;
    const key = startOfWeek(at).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.completed += 1;
    bucket.minutes += r.actualMins ?? 0;
    bucket.onTime += r.onTime === 1 ? 1 : 0;
  }

  return [...buckets.values()];
}

/** On-time rate change, most recent 4 weeks against the 4 before that. */
function trend(rows: EventRow[], now: Date): number | null {
  const cut = (weeksAgo: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - weeksAgo * 7);
    return d.getTime();
  };

  const recent = rows.filter((r) => new Date(r.completedAt).getTime() >= cut(4));
  const prior = rows.filter((r) => {
    const t = new Date(r.completedAt).getTime();
    return t >= cut(8) && t < cut(4);
  });

  // Three per window minimum, or the "trend" is one task changing its mind.
  if (recent.length < 3 || prior.length < 3) return null;

  const rate = (list: EventRow[]) => list.filter((r) => r.onTime === 1).length / list.length;
  return rate(recent) - rate(prior);
}
