import { availableMinutesBefore } from "@/lib/scholar/availability";
import type { AvailabilityProfile } from "@/lib/scholar/types";

/**
 * The week, in hours rather than days.
 *
 * Every LMS says "due in 3 days". Three days is not a quantity of anything a
 * student can spend — it contains a Saturday, two evenings with football, and
 * a Thursday that is already gone by four o'clock. Scholar knows the study
 * window and the rest days, so it can say "six hours before Friday", which is
 * the sentence that changes what somebody does tonight.
 *
 * Pure, and free of any database import. A student told to do three things in
 * a particular order will reasonably want to know why, and the reasoning
 * should be inspectable without a running system.
 */

export type WorkItem = {
  id: string;
  title: string;
  courseCode: string;
  sectionId: string;
  dueAt: Date | null;
  /** Calibrated to this student where there was evidence to calibrate with. */
  estimateMins: number | null;
};

/* ── The budget ────────────────────────────────────────────────────────── */

export type TimeBudget = {
  /** Everything outstanding, in minutes. */
  workMins: number;
  /** Study minutes before the *last* deadline. */
  availableMins: number;
  /** Study minutes before the *soonest* deadline. */
  availableBeforeNext: number;
  /** Work due before that soonest deadline. */
  workDueNext: number;
  /** Negative means more work than time. */
  slackMins: number;
  /** How many pieces carry no estimate, so the total is a floor not a figure. */
  unestimated: number;
};

/**
 * How much work there is, against how much time exists to do it in.
 *
 * Reported as a shortfall rather than softened when it is one. A student with
 * nine hours of work and six hours of evenings is in trouble, and the useful
 * thing to say is how much — early enough to ask for an extension or decide
 * what to drop, while either is still possible.
 *
 * Work with no estimate is counted separately rather than guessed at. A total
 * built partly from invented numbers is worse than one that admits its edges.
 */
export function timeBudget(
  items: WorkItem[],
  profile: AvailabilityProfile,
  now: Date = new Date()
): TimeBudget {
  const dated = items.filter((i) => i.dueAt && i.dueAt.getTime() > now.getTime());

  const workMins = items.reduce((sum, i) => sum + (i.estimateMins ?? 0), 0);
  const unestimated = items.filter((i) => i.estimateMins === null).length;

  if (dated.length === 0) {
    return {
      workMins, availableMins: 0, availableBeforeNext: 0,
      workDueNext: 0, slackMins: 0, unestimated,
    };
  }

  const deadlines = dated.map((i) => i.dueAt!.getTime()).sort((a, b) => a - b);
  const soonest = new Date(deadlines[0]);
  const last = new Date(deadlines[deadlines.length - 1]);

  const availableMins = availableMinutesBefore(last, profile, now);
  const availableBeforeNext = availableMinutesBefore(soonest, profile, now);

  const workDueNext = dated
    .filter((i) => i.dueAt!.getTime() <= soonest.getTime())
    .reduce((sum, i) => sum + (i.estimateMins ?? 0), 0);

  return {
    workMins,
    availableMins,
    availableBeforeNext,
    workDueNext,
    slackMins: availableMins - workMins,
    unestimated,
  };
}

/* ── The order ─────────────────────────────────────────────────────────── */

export type Sequenced = WorkItem & {
  /** Study minutes between now and this deadline. */
  availableMins: number;
  /** Available minus everything that must be done by then, including this. */
  slackMins: number;
  /** Why it sits where it does, in words a student can argue with. */
  reason: string;
  /** True when there is not enough time left for it, by their own numbers. */
  atRisk: boolean;
};

/**
 * What to do first, and why.
 *
 * Not sorted by deadline. Sorting by deadline is what a student does on their
 * own and it is what gets them into trouble: a four-hour essay due Friday
 * needs starting before a twenty-minute worksheet due Wednesday, and the
 * deadline order says the opposite.
 *
 * Ordered by slack — the time available before a deadline, minus everything
 * that has to be finished by then. Least slack first. That is a genuine
 * scheduling heuristic rather than a heuristic-shaped guess, and it has the
 * property that matters here: it can be explained in one sentence to the
 * person being told what to do.
 *
 * Slack is cumulative on purpose. The worksheet due Wednesday is not competing
 * with the essay for Friday's hours alone; it is competing for every hour
 * before Wednesday, and so is any part of the essay done early.
 */
export function orderOfWork(
  items: WorkItem[],
  profile: AvailabilityProfile,
  now: Date = new Date()
): Sequenced[] {
  const dated = items
    .filter((i) => i.dueAt && i.estimateMins !== null)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  // Everything due at or before each deadline competes for the same hours.
  let committed = 0;
  const withSlack = dated.map((i) => {
    const available = availableMinutesBefore(i.dueAt!, profile, now);
    committed += i.estimateMins!;
    return {
      ...i,
      availableMins: available,
      slackMins: available - committed,
    };
  });

  const ordered = [...withSlack].sort((a, b) => a.slackMins - b.slackMins);

  return ordered.map((i, rank) => {
    const hours = (n: number) => Math.round((n / 60) * 10) / 10;

    if (i.slackMins < 0) {
      return {
        ...i,
        atRisk: true,
        reason: `About ${hours(-i.slackMins)} hours short of the time before this is due, counting everything due sooner.`,
      };
    }
    if (rank === 0) {
      return {
        ...i,
        atRisk: false,
        reason: i.slackMins < 120
          ? `Least room of anything you have — about ${hours(i.slackMins)} hours spare.`
          : "Least room of anything you have, once everything due sooner is counted.",
      };
    }
    return {
      ...i,
      atRisk: false,
      reason: `About ${hours(i.slackMins)} hours spare after everything due before it.`,
    };
  });
}

/* ── Receipts ──────────────────────────────────────────────────────────── */

export type Receipt = {
  subject: string;
  /** How many finished pieces this is drawn from. */
  occasions: number;
  estimatedMins: number;
  actualMins: number;
  /** Actual over estimated. Above 1 means work takes longer than they think. */
  ratio: number;
};

export type Calibration = {
  receipts: Receipt[];
  /** The subject furthest adrift, when there is enough evidence to name one. */
  worst: Receipt | null;
  /** Across everything, actual over estimated. */
  overall: number | null;
};

/** Fewer than this and a ratio is an anecdote rather than a pattern. */
export const MIN_FINISHED = 3;

/**
 * What a student's own estimates have actually been worth.
 *
 * Scholar has been quietly measuring this since long before there was an
 * institution in the picture, and using it to correct the estimates it shows
 * — but never telling the student. That is the wrong way round. Somebody who
 * knows their physics estimates run forty percent short can do something
 * about it tonight; somebody whose estimates are silently corrected for them
 * learns nothing.
 *
 * Reported as receipts rather than a score. "You said two hours, it took
 * three and a half" is a fact about an afternoon. "Your estimation accuracy
 * is 57%" is a grade for a thing nobody was being graded on.
 */
export function calibration(
  rows: Array<{ subject: string; estimateMins: number; actualMins: number }>
): Calibration {
  const bySubject = new Map<string, { est: number; act: number; n: number }>();

  for (const r of rows) {
    // Only pieces where both numbers exist. A task somebody never estimated
    // says nothing about their estimating.
    if (!(r.estimateMins > 0) || !(r.actualMins > 0)) continue;
    const cur = bySubject.get(r.subject) ?? { est: 0, act: 0, n: 0 };
    cur.est += r.estimateMins;
    cur.act += r.actualMins;
    cur.n += 1;
    bySubject.set(r.subject, cur);
  }

  const receipts: Receipt[] = [...bySubject.entries()]
    .map(([subject, v]) => ({
      subject,
      occasions: v.n,
      estimatedMins: v.est,
      actualMins: v.act,
      ratio: Math.round((v.act / v.est) * 100) / 100,
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const eligible = receipts.filter((r) => r.occasions >= MIN_FINISHED);

  // Only worth naming when it is genuinely adrift. Being ten percent out is
  // being about right, and saying so would be nagging.
  const candidate = eligible[0] ?? null;
  const worst = candidate && Math.abs(candidate.ratio - 1) >= 0.25 ? candidate : null;

  const totalEst = receipts.reduce((s, r) => s + r.estimatedMins, 0);
  const totalAct = receipts.reduce((s, r) => s + r.actualMins, 0);

  return {
    receipts,
    worst,
    overall: totalEst > 0 ? Math.round((totalAct / totalEst) * 100) / 100 : null,
  };
}
