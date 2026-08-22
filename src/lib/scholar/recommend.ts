import { minutesLeftToday } from "./availability";
import { assessRisk, expectedRemainingMins, formatMins } from "./priority";
import {
  DEFAULT_AVAILABILITY,
  type AvailabilityProfile,
  type ScorableTask,
  type SubjectPace,
  type TaskRisk,
} from "./types";

export type Recommendation = {
  task: ScorableTask;
  risk: TaskRisk;
  /** Why this task, in one or two plain sentences. */
  rationale: string;
  /** Minutes suggested for this sitting — may be less than the whole task. */
  sessionMins: number;
  /** True when the task won't fit in the time left and should be chipped at. */
  partial: boolean;
};

export type NowContext = {
  /** Study minutes left today, from the profile. */
  availableNowMins: number;
  recommendation: Recommendation | null;
  /** Runners-up, already risk-ordered. */
  alternatives: Array<{ task: ScorableTask; risk: TaskRisk }>;
  /** Shown when there's nothing to recommend. */
  emptyReason: string | null;
};

/**
 * Pick the single best thing to work on right now.
 *
 * The rule that makes this useful rather than just "highest risk first": a task
 * that cannot make meaningful progress in the time actually left today loses to
 * one that can be finished. Recommending a 3-hour task at 9:40pm is technically
 * correct and practically useless.
 */
export function whatShouldIDoNow(
  tasks: ScorableTask[],
  options: {
    now?: Date;
    profile?: AvailabilityProfile;
    paceBySubject?: Record<string, SubjectPace>;
    /** Override the time the student says they have, e.g. "I have 90 minutes". */
    availableMinsOverride?: number | null;
  } = {}
): NowContext {
  const now = options.now ?? new Date();
  const profile = options.profile ?? DEFAULT_AVAILABILITY;
  const paceBySubject = options.paceBySubject ?? {};

  const availableNowMins =
    options.availableMinsOverride ?? minutesLeftToday(profile, now);

  const open = tasks.filter((t) => t.status !== "done");

  if (open.length === 0) {
    return {
      availableNowMins,
      recommendation: null,
      alternatives: [],
      emptyReason: "Nothing open. You're clear.",
    };
  }

  const scored = open
    .map((task) => ({
      task,
      risk: assessRisk(task, { now, profile, pace: paceBySubject[task.subject] }),
    }))
    .sort((a, b) => b.risk.score - a.risk.score);

  if (availableNowMins <= 0) {
    return {
      availableNowMins: 0,
      recommendation: null,
      alternatives: scored.slice(0, 3),
      emptyReason:
        "You're outside your study hours. Nothing recommended right now — adjust your study window in settings if this is wrong.",
    };
  }

  // Prefer the highest-risk task that fits. "Fits" is generous: anything that
  // can absorb at least 20 minutes of real progress counts, since most work is
  // resumable and momentum matters more than completion.
  const MIN_USEFUL_SESSION = 20;

  const fits = scored.filter((s) => {
    const remaining = expectedRemainingMins(s.task, paceBySubject[s.task.subject]);
    return remaining <= availableNowMins || availableNowMins >= MIN_USEFUL_SESSION;
  });

  const chosen = fits[0] ?? scored[0];
  const remaining = expectedRemainingMins(chosen.task, paceBySubject[chosen.task.subject]);
  const partial = remaining > availableNowMins;
  const sessionMins = Math.max(1, Math.min(remaining, availableNowMins));

  return {
    availableNowMins,
    recommendation: {
      task: chosen.task,
      risk: chosen.risk,
      rationale: buildRationale(chosen.risk, remaining, availableNowMins, partial),
      sessionMins,
      partial,
    },
    alternatives: scored.filter((s) => s.task.id !== chosen.task.id).slice(0, 3),
    emptyReason: null,
  };
}

function buildRationale(
  risk: TaskRisk,
  remainingMins: number,
  availableNowMins: number,
  partial: boolean
): string {
  const base = risk.reason;

  if (partial) {
    return `${base} You have about ${formatMins(availableNowMins)} now — enough to make a real dent, not to finish it.`;
  }
  return `${base} It fits in the ${formatMins(availableNowMins)} you have left today.`;
}
