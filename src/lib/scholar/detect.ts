import { capacityForDay } from "./availability";
import { assessRisk, expectedRemainingMins, formatMins } from "./priority";
import { analyseWorkload } from "./workload";
import {
  DEFAULT_AVAILABILITY,
  type AvailabilityProfile,
  type ScorableTask,
  type SubjectPace,
} from "./types";

/**
 * Academic risk detection.
 *
 * Surfaces situations before they become crises. Deliberately conservative:
 * every signal has a minimum evidence threshold, because a warning that fires
 * on noise trains the student to ignore all warnings.
 *
 * Language is strictly about workload and scheduling. This engine never claims
 * anything about the student's wellbeing, health, or state of mind — it can see
 * deadlines and durations, and nothing else.
 */

export type SignalKind =
  | "deadline-cluster"
  | "insufficient-time"
  | "overdue-pileup"
  | "chronic-underestimation"
  | "repeated-lateness"
  | "exam-approaching"
  | "long-untouched";

export type Severity = "high" | "medium" | "low";

export type RiskSignal = {
  kind: SignalKind;
  severity: Severity;
  /** Short headline, shown as the notification title. */
  title: string;
  /** One or two sentences of specifics — always with real numbers. */
  detail: string;
  /** Suggested next step, or null when there's no single obvious action. */
  action: string | null;
  /** Homework ids this concerns, so the UI can link to them. */
  taskIds: string[];
  /** Stable identity for dismissal — same situation must produce the same key. */
  key: string;
};

export type DetectOptions = {
  now?: Date;
  profile?: AvailabilityProfile;
  paceBySubject?: Record<string, SubjectPace>;
  /** Completed-task history, for behavioural signals. */
  history?: Array<{
    subjectName: string;
    estimateMins: number | null;
    actualMins: number | null;
    onTime: number;
    completedAt: string;
  }>;
};

const DAY_MS = 86_400_000;

export function detectRisks(tasks: ScorableTask[], options: DetectOptions = {}): RiskSignal[] {
  const now = options.now ?? new Date();
  const profile = options.profile ?? DEFAULT_AVAILABILITY;
  const pace = options.paceBySubject ?? {};
  const history = options.history ?? [];

  const open = tasks.filter((t) => t.status !== "done");
  const signals: RiskSignal[] = [];

  signals.push(...detectInsufficientTime(open, now, profile, pace));
  signals.push(...detectDeadlineClusters(open, now, profile, pace));
  signals.push(...detectOverduePileup(open, now, pace));
  signals.push(...detectExamPrep(open, now, profile, pace));
  signals.push(...detectChronicUnderestimation(history));
  signals.push(...detectRepeatedLateness(history));

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Individual tasks whose remaining work exceeds the study time left before the deadline. */
function detectInsufficientTime(
  open: ScorableTask[],
  now: Date,
  profile: AvailabilityProfile,
  pace: Record<string, SubjectPace>
): RiskSignal[] {
  const out: RiskSignal[] = [];

  for (const task of open) {
    if (!task.dueAt) continue;
    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime()) || due.getTime() <= now.getTime()) continue;

    const risk = assessRisk(task, { now, profile, pace: pace[task.subject] });
    if (risk.availableMins <= 0) continue;
    if (risk.remainingMins <= risk.availableMins) continue;

    const shortfall = risk.remainingMins - risk.availableMins;

    out.push({
      kind: "insufficient-time",
      severity: "high",
      title: `${task.title} is becoming risky`,
      detail: `About ${formatMins(risk.remainingMins)} of work remains, but only ${formatMins(
        risk.availableMins
      )} of study time before it's due — a shortfall of roughly ${formatMins(shortfall)}.`,
      action: "Reorganise my schedule",
      taskIds: [task.id],
      key: `insufficient:${task.id}`,
    });
  }

  return out;
}

/** Days carrying more work than the student can realistically do. */
function detectDeadlineClusters(
  open: ScorableTask[],
  now: Date,
  profile: AvailabilityProfile,
  pace: Record<string, SubjectPace>
): RiskSignal[] {
  const workload = analyseWorkload(open, { now, profile, paceBySubject: pace, days: 14 });

  return workload.days
    .filter((d) => d.overloaded && d.deadlines >= 2)
    .slice(0, 3)
    .map((d) => ({
      kind: "deadline-cluster" as const,
      // One overloaded day is manageable; a badly overloaded one is not.
      severity: d.utilisation >= 2 ? ("high" as const) : ("medium" as const),
      title: `${d.label} is overloaded`,
      detail: `${d.deadlines} deadlines land on ${d.label.toLowerCase()}, totalling about ${formatMins(
        d.workMins
      )} against roughly ${formatMins(d.capacityMins)} of study time that day.`,
      action: "Start something early",
      taskIds: [],
      key: `cluster:${d.date}`,
    }));
}

function detectOverduePileup(
  open: ScorableTask[],
  now: Date,
  pace: Record<string, SubjectPace>
): RiskSignal[] {
  const overdue = open.filter((t) => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
  });

  if (overdue.length < 3) return [];

  const totalMins = overdue.reduce((sum, t) => sum + expectedRemainingMins(t, pace[t.subject]), 0);

  return [
    {
      kind: "overdue-pileup",
      severity: overdue.length >= 5 ? "high" : "medium",
      title: `${overdue.length} tasks are overdue`,
      detail: `They add up to roughly ${formatMins(
        totalMins
      )} of work. Clearing the smallest ones first will bring the count down fastest.`,
      action: "Show overdue work",
      taskIds: overdue.map((t) => t.id),
      key: `overdue:${overdue.length}`,
    },
  ];
}

/** An exam close enough to matter, with little or no preparation scheduled. */
function detectExamPrep(
  open: ScorableTask[],
  now: Date,
  profile: AvailabilityProfile,
  pace: Record<string, SubjectPace>
): RiskSignal[] {
  const out: RiskSignal[] = [];
  const EXAM = /\b(exam|test|midterm|mid-term|final|paper \d)\b/i;

  for (const task of open) {
    if (!task.dueAt || !EXAM.test(task.title)) continue;
    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime())) continue;

    const daysAway = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
    if (daysAway < 0 || daysAway > 14) continue;

    // Preparation = other open tasks for the same subject due before the exam.
    const prep = open.filter(
      (t) =>
        t.id !== task.id &&
        t.subject === task.subject &&
        t.dueAt &&
        new Date(t.dueAt).getTime() < due.getTime() &&
        new Date(t.dueAt).getTime() >= now.getTime()
    );

    const prepMins = prep.reduce((sum, t) => sum + expectedRemainingMins(t, pace[t.subject]), 0);
    // Two sessions, or an hour of scheduled work, counts as having a plan.
    if (prep.length >= 2 || prepMins >= 60) continue;

    out.push({
      kind: "exam-approaching",
      severity: daysAway <= 5 ? "high" : "medium",
      title: `${task.title} is in ${daysAway === 0 ? "less than a day" : `${daysAway} day${daysAway === 1 ? "" : "s"}`}`,
      detail:
        prep.length === 0
          ? `Nothing is scheduled to prepare for it. About ${formatMins(
              capacityForDay(now, profile)
            )} of study time is available on a typical day between now and then.`
          : `Only ${formatMins(prepMins)} of preparation is scheduled before it.`,
      action: "Plan revision sessions",
      taskIds: [task.id],
      key: `exam:${task.id}`,
    });
  }

  return out;
}

/** Estimates that are consistently far below reality, per subject. */
function detectChronicUnderestimation(history: DetectOptions["history"]): RiskSignal[] {
  if (!history?.length) return [];

  const bySubject = new Map<string, { estimate: number; actual: number; n: number }>();
  for (const e of history) {
    if (!e.estimateMins || !e.actualMins) continue;
    const acc = bySubject.get(e.subjectName) ?? { estimate: 0, actual: 0, n: 0 };
    acc.estimate += e.estimateMins;
    acc.actual += e.actualMins;
    acc.n += 1;
    bySubject.set(e.subjectName, acc);
  }

  const out: RiskSignal[] = [];
  for (const [subject, acc] of bySubject) {
    // Four sessions minimum: below that a single long task dominates the ratio.
    if (acc.n < 4 || acc.estimate === 0) continue;
    const ratio = acc.actual / acc.estimate;
    if (ratio < 1.4) continue;

    out.push({
      kind: "chronic-underestimation",
      severity: "low",
      title: `${subject} takes longer than you plan for`,
      detail: `Across ${acc.n} sessions, ${subject} work has taken about ${Math.round(
        (ratio - 1) * 100
      )}% longer than estimated. Scholar already adjusts for this when judging deadlines.`,
      action: null,
      taskIds: [],
      key: `underestimate:${subject}`,
    });
  }

  return out;
}

/** A recent pattern of finishing after the deadline. */
function detectRepeatedLateness(history: DetectOptions["history"]): RiskSignal[] {
  if (!history?.length) return [];

  const recent = [...history]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 10);

  if (recent.length < 5) return [];

  const late = recent.filter((e) => e.onTime === 0).length;
  const rate = late / recent.length;
  if (rate < 0.4) return [];

  return [
    {
      kind: "repeated-lateness",
      severity: rate >= 0.6 ? "medium" : "low",
      title: "Work has been finishing late",
      detail: `${late} of your last ${recent.length} tasks were completed after the deadline. Starting earlier on the largest task each week is usually the quickest fix.`,
      action: null,
      taskIds: [],
      key: `lateness:${late}-${recent.length}`,
    },
  ];
}
