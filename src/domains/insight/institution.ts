/**
 * How an institution is doing, from the institution's own records.
 *
 * The line this module holds, and the reason it is a separate file with its
 * own tests: an administrator may see what the institution did, and may not
 * see how a student lives.
 *
 * Everything computed here is derived from institutional facts — work set,
 * work handed in, work marked, and when. Those are already visible to the
 * teachers involved, and aggregating them tells an administrator whether the
 * institution is functioning: whether marking is being returned, whether
 * anyone has been forgotten.
 *
 * What is deliberately absent is the personal layer. Scholar knows when a
 * student studies, how long they focus, what they have planned, when they
 * gave up on an evening. None of it is here, none of it is reachable from
 * here, and no aggregate of it is offered to an administrator however
 * anonymised it might look. A tool that reports "engagement is down in Year
 * 9" is a surveillance tool wearing a pastoral coat, and building it because
 * the data happens to be in the same database would be the single worst thing
 * this product could do with what students have told it.
 *
 * The asymmetry is on purpose. Slow marking is an institutional failure and
 * the institution should be confronted with it. A student having a bad month
 * is that student's business, and the person who should hear about it is
 * their teacher, through the work — not an administrator, through a chart.
 */

export type MarkingHealth = {
  /** Work handed in and marked, in the period. */
  marked: number;
  /** Still waiting. */
  outstanding: number;
  /** Median days from handing in to getting it back. Null when nothing is marked. */
  medianDays: number | null;
  /** The longest anyone is currently still waiting. */
  worstWaitDays: number | null;
  /** Share of handed-in work that has been returned, 0-1. */
  returnRate: number | null;
};

export type MarkedItem = { submittedAt: string | null; gradedAt: string | null };

const DAY = 86_400_000;

/**
 * Turnaround, from the student's side of it.
 *
 * Median rather than mean, because one assignment left for a term would drag
 * an average into meaninglessness while thirty pieces returned next-day sat
 * underneath it. The median says what a student can actually expect.
 *
 * The worst outstanding wait is reported alongside, because a median of two
 * days is no comfort to the person who has been waiting five weeks, and an
 * administrator looking only at the median would never learn they exist.
 */
export function markingHealth(items: MarkedItem[], now: Date = new Date()): MarkingHealth {
  const waits: number[] = [];
  let outstanding = 0;
  let worst: number | null = null;

  for (const it of items) {
    if (!it.submittedAt) continue;
    const from = Date.parse(it.submittedAt);
    if (!Number.isFinite(from)) continue;

    if (it.gradedAt) {
      const to = Date.parse(it.gradedAt);
      if (Number.isFinite(to) && to >= from) waits.push((to - from) / DAY);
    } else {
      outstanding++;
      const waiting = (now.getTime() - from) / DAY;
      if (worst === null || waiting > worst) worst = waiting;
    }
  }

  const marked = waits.length;
  const total = marked + outstanding;

  return {
    marked,
    outstanding,
    medianDays: marked === 0 ? null : round1(median(waits)),
    worstWaitDays: worst === null ? null : round1(worst),
    returnRate: total === 0 ? null : round2(marked / total),
  };
}

export type CourseHealth = {
  courseId: string;
  code: string;
  title: string;
  published: number;
  outstanding: number;
  worstWaitDays: number | null;
  /** Set when this course needs an administrator's attention, with the reason. */
  concern: string | null;
};

/**
 * Which courses need looking at.
 *
 * A concern is raised on the institution's conduct, never on a student's. The
 * thresholds are judgement calls and are written into the message as such, so
 * an administrator reads "nothing returned for over three weeks" rather than
 * a status word that sounds computed.
 */
export function courseConcerns(
  courses: Omit<CourseHealth, "concern">[]
): CourseHealth[] {
  return courses.map((c) => ({
    ...c,
    concern:
      c.worstWaitDays !== null && c.worstWaitDays >= 21
        ? `Work has been waiting ${Math.round(c.worstWaitDays)} days to be marked.`
        : c.outstanding >= 30
          ? `${c.outstanding} pieces of work are waiting to be marked.`
          : c.published === 0
            ? "No work has been set on this course yet."
            : null,
  }));
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
