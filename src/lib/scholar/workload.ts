import { capacityForDay } from "./availability";
import { assessRisk, expectedRemainingMins, formatMins } from "./priority";
import {
  DEFAULT_AVAILABILITY,
  type AvailabilityProfile,
  type ScorableTask,
  type SubjectPace,
} from "./types";

export type DayLoad = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  label: string;
  /** Estimated work due on this day, in minutes. */
  workMins: number;
  /** Study minutes realistically available on this day. */
  capacityMins: number;
  deadlines: number;
  /** True when work due exceeds what the student can realistically do that day. */
  overloaded: boolean;
  /** workMins / capacityMins, clamped for display. */
  utilisation: number;
};

export type WorkloadSummary = {
  days: DayLoad[];
  totalMins: number;
  overdueCount: number;
  overdueMins: number;
  busiestDay: DayLoad | null;
  /** One-line, plain-language read on the period. */
  headline: string;
};

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(d: Date, now: Date): string {
  const diff = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Bucket upcoming work by the day it's due.
 *
 * Deliberately buckets by deadline rather than spreading effort across days:
 * this view answers "which day am I going to get crushed", and it's the day the
 * work lands that determines that. Scheduling work backward across days is the
 * planner's job, not this summary's.
 */
export function analyseWorkload(
  tasks: ScorableTask[],
  options: {
    now?: Date;
    days?: number;
    profile?: AvailabilityProfile;
    paceBySubject?: Record<string, SubjectPace>;
  } = {}
): WorkloadSummary {
  const now = options.now ?? new Date();
  const horizon = options.days ?? 14;
  const profile = options.profile ?? DEFAULT_AVAILABILITY;
  const paceBySubject = options.paceBySubject ?? {};

  const open = tasks.filter((t) => t.status !== "done");

  const buckets = new Map<string, DayLoad>();
  for (let i = 0; i < horizon; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    buckets.set(dayKey(d), {
      date: dayKey(d),
      label: dayLabel(d, now),
      workMins: 0,
      capacityMins: capacityForDay(d, profile),
      deadlines: 0,
      overloaded: false,
      utilisation: 0,
    });
  }

  let overdueCount = 0;
  let overdueMins = 0;
  let totalMins = 0;

  for (const task of open) {
    const mins = expectedRemainingMins(task, paceBySubject[task.subject]);
    if (!task.dueAt) continue;

    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime())) continue;

    if (due.getTime() < now.getTime()) {
      overdueCount++;
      overdueMins += mins;
      totalMins += mins;
      continue;
    }

    const bucket = buckets.get(dayKey(due));
    if (!bucket) continue; // Beyond the horizon.

    bucket.workMins += mins;
    bucket.deadlines += 1;
    totalMins += mins;
  }

  const days = [...buckets.values()];
  for (const d of days) {
    d.utilisation = d.capacityMins > 0 ? d.workMins / d.capacityMins : 0;
    d.overloaded = d.workMins > d.capacityMins;
  }

  const busiestDay = days.reduce<DayLoad | null>(
    (worst, d) => (!worst || d.workMins > worst.workMins ? d : worst),
    null
  );

  return {
    days,
    totalMins,
    overdueCount,
    overdueMins,
    busiestDay: busiestDay && busiestDay.workMins > 0 ? busiestDay : null,
    headline: buildHeadline({ days, overdueCount, overdueMins, busiestDay, totalMins }),
  };
}

function buildHeadline(s: {
  days: DayLoad[];
  overdueCount: number;
  overdueMins: number;
  busiestDay: DayLoad | null;
  totalMins: number;
}): string {
  if (s.overdueCount > 0) {
    return `${s.overdueCount} overdue task${s.overdueCount === 1 ? "" : "s"} — about ${formatMins(s.overdueMins)} of work to catch up on.`;
  }

  const overloaded = s.days.filter((d) => d.overloaded);
  if (overloaded.length > 0) {
    const first = overloaded[0];
    return `${first.label} is overloaded — ${first.deadlines} deadline${first.deadlines === 1 ? "" : "s"} and about ${formatMins(first.workMins)} of work against roughly ${formatMins(first.capacityMins)} of study time.`;
  }

  if (s.totalMins === 0) return "Nothing scheduled in the next two weeks.";

  if (s.busiestDay && s.busiestDay.workMins > 0) {
    return `About ${formatMins(s.totalMins)} of work ahead. Busiest day is ${s.busiestDay.label} at ${formatMins(s.busiestDay.workMins)}.`;
  }

  return `About ${formatMins(s.totalMins)} of work ahead, spread comfortably.`;
}

/** Risk-ordered view of open tasks — the ordering the dashboard actually uses. */
export function rankByRisk(
  tasks: ScorableTask[],
  options: {
    now?: Date;
    profile?: AvailabilityProfile;
    paceBySubject?: Record<string, SubjectPace>;
  } = {}
) {
  const paceBySubject = options.paceBySubject ?? {};
  return tasks
    .filter((t) => t.status !== "done")
    .map((task) => ({
      task,
      risk: assessRisk(task, {
        now: options.now,
        profile: options.profile,
        pace: paceBySubject[task.subject],
      }),
    }))
    .sort((a, b) => b.risk.score - a.risk.score);
}
