import { availableMinutesBefore, capacityForDay } from "@/lib/scholar/availability";
import type { AvailabilityProfile, SubjectPace } from "@/lib/scholar/types";

/**
 * What the institution's data becomes once Scholar has thought about it.
 *
 * This is the join the whole product is an argument for. A course tells a
 * student what is due and roughly how long it should take. Scholar knows how
 * long things actually take *this* student, and how much time they really
 * have. Neither half is useful alone: the teacher's estimate is written for a
 * hypothetical average student who does not exist, and the student's own
 * history cannot tell them about an assignment that has not been set yet.
 *
 * Pure, and free of any database import, for the same reason the gradebook and
 * the quiz marker are: a student will be told to start something on a
 * particular day, and will reasonably want to know why. Logic that decides
 * that should be inspectable without a running system.
 */

/**
 * The teacher's estimate, corrected by what this student has actually done.
 *
 * A teacher writing "about an hour" is describing the work, not the person.
 * A student who has consistently taken half as long again in this subject is
 * not going to be the exception this time, and telling them an hour when the
 * truthful answer is ninety minutes is how a plan quietly becomes a lie.
 *
 * Two guards on that correction:
 *
 * It does not apply below a sample size. Calibrating on one finished task
 * would mean a single bad afternoon permanently inflating every future
 * estimate in a subject, which is both wrong and demoralising to read.
 *
 * The correction is the student's own measured ratio, already clamped to
 * 0.5–3 upstream. Scholar does not invent a number here; it applies one the
 * student earned by finishing things.
 */
export const MIN_PACE_SAMPLE = 3;

export function calibrateEstimate(
  teacherMins: number | null,
  pace: SubjectPace | undefined
): { mins: number | null; adjusted: boolean; reason: string } {
  if (teacherMins === null || !Number.isFinite(teacherMins) || teacherMins <= 0) {
    return { mins: null, adjusted: false, reason: "No estimate was set for this work." };
  }

  if (!pace || pace.sampleSize < MIN_PACE_SAMPLE) {
    return {
      mins: Math.round(teacherMins),
      adjusted: false,
      // Said plainly rather than hidden: a number with no history behind it
      // should not be presented with the same confidence as one with.
      reason: "Your teacher's estimate. Scholar has not seen enough of your work in this subject to adjust it yet.",
    };
  }

  const mins = Math.round(teacherMins * pace.calibration);

  // A calibration close enough to 1 is not worth mentioning, and claiming an
  // adjustment that changed nothing would be noise dressed as insight.
  if (mins === Math.round(teacherMins)) {
    return { mins, adjusted: false, reason: "Your teacher's estimate, which matches your usual pace here." };
  }

  const pct = Math.round(Math.abs(pace.calibration - 1) * 100);
  return {
    mins,
    adjusted: true,
    reason:
      pace.calibration > 1
        ? `Your teacher estimated ${Math.round(teacherMins)} minutes. Work in this subject has taken you about ${pct}% longer than estimated, so Scholar has allowed for that.`
        : `Your teacher estimated ${Math.round(teacherMins)} minutes. You tend to finish this subject about ${pct}% faster, so Scholar has allowed less.`,
  };
}

export type StartPlan =
  /** There is room. Begin by this day and the work fits comfortably. */
  | { kind: "start-by"; startBy: Date; slackMins: number }
  /** It fits only if begun now. */
  | { kind: "start-now"; slackMins: number }
  /** It does not fit in the time left, by this student's own numbers. */
  | { kind: "too-late"; shortfallMins: number }
  /** Nothing to plan: no estimate, or no deadline. */
  | { kind: "unknown"; reason: string };

/**
 * The last day this can be begun and still finished.
 *
 * Worked backwards from the deadline through the student's declared study
 * capacity, rather than forwards from today, because the question a deadline
 * actually poses is "how late can I leave this", and answering the question
 * that was asked is more useful than answering a tidier one.
 *
 * The shortfall case is deliberately reported rather than softened. A student
 * with nine hours of work and six hours of study time before the deadline is
 * in trouble, and the useful thing to say is how much trouble — early enough
 * to ask for an extension, or to decide what to drop, while either is still
 * possible.
 */
export function planStart(
  dueAt: Date | null,
  estimateMins: number | null,
  profile: AvailabilityProfile,
  now: Date = new Date()
): StartPlan {
  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return { kind: "unknown", reason: "This work has no deadline." };
  }
  if (estimateMins === null || estimateMins <= 0) {
    return { kind: "unknown", reason: "Scholar does not know how long this should take." };
  }

  const total = availableMinutesBefore(dueAt, profile, now);
  if (total < estimateMins) {
    return { kind: "too-late", shortfallMins: Math.round(estimateMins - total) };
  }

  // Walk back a day at a time from the deadline. Starting later leaves less
  // time, so the first day going backwards that affords the whole estimate is
  // the latest one it can be begun on.
  const slack = Math.round(total - estimateMins);
  const cursor = new Date(dueAt);
  cursor.setHours(0, 0, 0, 0);

  for (let guard = 0; guard < 366; guard++) {
    // Never propose a start in the past: from today onwards, the earliest
    // possible start is now.
    const candidate = laterOf(cursor, now);

    if (availableMinutesBefore(dueAt, profile, candidate) >= estimateMins) {
      return sameDay(candidate, now)
        ? { kind: "start-now", slackMins: slack }
        : { kind: "start-by", startBy: candidate, slackMins: slack };
    }

    // Walked back past today without finding a day that affords it, even
    // though `total` said it fits. That is the boundary case: it fits only if
    // begun immediately.
    if (cursor.getTime() <= now.getTime()) break;

    cursor.setDate(cursor.getDate() - 1);
  }

  return { kind: "start-now", slackMins: slack };
}

/**
 * One piece of coursework, as Scholar sees it.
 *
 * Declared here rather than beside the query that builds it because client
 * components display this, and a type imported from the query module would
 * pull the database into the browser bundle.
 */
export type WorkPlan = {
  assignmentId: string;
  title: string;
  dueAt: string | null;
  /** The teacher's figure, untouched. */
  teacherMins: number | null;
  /** What Scholar thinks it will take this student. */
  expectedMins: number | null;
  adjusted: boolean;
  /** Why the number is what it is, in words the student can check. */
  reason: string;
  plan: StartPlan;
};

/* ── The other direction: what the institution should know ─────────────── */

export type DeadlineLoad = {
  /** Midnight of the day, as an ISO date string. */
  day: string;
  /** Work already due that day for this class. */
  existing: number;
  /** Minutes of work, by the teachers' own estimates. */
  estimatedMins: number;
};

export type CollisionWarning = {
  day: string;
  existing: number;
  estimatedMins: number;
  severity: "high" | "medium";
  message: string;
};

/**
 * What a teacher should be told before they publish a deadline.
 *
 * The reverse of everything above, and the half an LMS normally cannot do at
 * all: a teacher can see their own assignments and has no idea that the same
 * class has two other things due that Thursday. The student feels the
 * collision; nobody who caused it ever sees it.
 *
 * Deliberately a warning and never a block. A teacher may have an excellent
 * reason to set work into a crowded week, and a system that overrules them on
 * a heuristic would be wrong more often than it was right — and would be
 * resented in exactly the cases where it was correct.
 */
export function deadlineCollisions(
  load: DeadlineLoad[],
  proposedDay: string,
  proposedMins: number | null
): CollisionWarning | null {
  const day = load.find((d) => d.day === proposedDay);
  if (!day || day.existing === 0) return null;

  const totalMins = day.estimatedMins + (proposedMins ?? 0);
  const count = day.existing + 1;

  // Three pieces of work, or more than three hours, on one evening. Both
  // thresholds are judgement calls and are stated as such in the copy rather
  // than presented as a computed fact.
  const high = count >= 3 || totalMins > 180;
  if (!high && count < 2) return null;

  return {
    day: proposedDay,
    existing: day.existing,
    estimatedMins: totalMins,
    severity: high ? "high" : "medium",
    message: high
      ? `This class already has ${day.existing} ${day.existing === 1 ? "piece" : "pieces"} of work due that day — around ${Math.round(totalMins / 60)} hours in total with this one. Consider moving it.`
      : `This class already has ${day.existing} other piece of work due that day.`,
  };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? new Date(a) : new Date(b);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Exported for the tests that pin the weekday/weekend distinction. */
export { capacityForDay };
