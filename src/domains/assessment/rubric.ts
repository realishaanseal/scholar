/**
 * Marking against criteria.
 *
 * Pure, and free of any database import, for the same reason the gradebook
 * and the quiz marker are: this decides what a student is told they scored on
 * "use of evidence", and that is a sentence somebody will one day ask a
 * teacher to defend.
 *
 * The decisions worth stating:
 *
 *   A criterion nobody has marked is not a zero. Same rule as the gradebook,
 *   for the same reason — a rubric half filled in should read as half filled
 *   in, not as a bad mark. Only when every criterion has been decided is the
 *   rubric a total.
 *
 *   A rubric can be the mark or an explanation of one. Which it is belongs to
 *   the assignment, not to this function, because sometimes a teacher marks
 *   holistically and uses the rubric to say why. Guessing produces a gradebook
 *   nobody trusts.
 *
 *   Points are never inferred from a level's position. A rubric whose levels
 *   run 4/3/2/0 is a real thing teachers build on purpose, and treating the
 *   fourth level as "1 because it is fourth" would silently rewrite it.
 */

export type Level = {
  id: string;
  label: string;
  points: number;
};

export type Criterion = {
  id: string;
  title: string;
  /** What this criterion is worth at its best. */
  points: number;
  levels: Level[];
};

export type Mark = {
  criterionId: string;
  /** The level chosen, when the marker picked one. */
  levelId?: string | null;
  /** A typed score, when they did not. */
  points?: number | null;
  comment?: string;
};

export type CriterionResult = {
  criterionId: string;
  title: string;
  /** Null when nobody has marked this criterion yet. */
  awarded: number | null;
  possible: number;
  levelId: string | null;
  levelLabel: string | null;
  comment: string;
};

export type RubricResult = {
  criteria: CriterionResult[];
  /** Points settled so far. Not the total unless `complete`. */
  awarded: number;
  /** Everything the rubric is worth. */
  possible: number;
  /** True once every criterion has been decided. */
  complete: boolean;
  /** How many criteria still need a decision. */
  outstanding: number;
  /** Awarded over possible, 0-100. Null until complete. */
  percentage: number | null;
};

/**
 * Score one criterion.
 *
 * A chosen level wins over a typed score, because picking a level is the more
 * specific act — a marker who clicked "Meets expectations" and then typed a
 * number was correcting themselves, and the interface should have cleared the
 * level rather than leaving both. Preferring the level here means the stored
 * result matches what the marker last clicked.
 */
export function scoreCriterion(
  criterion: Criterion,
  mark: Mark | undefined
): CriterionResult {
  const base: CriterionResult = {
    criterionId: criterion.id,
    title: criterion.title,
    awarded: null,
    possible: criterion.points,
    levelId: null,
    levelLabel: null,
    comment: mark?.comment ?? "",
  };

  if (!mark) return base;

  if (mark.levelId) {
    const level = criterion.levels.find((l) => l.id === mark.levelId);
    if (level) {
      return {
        ...base,
        awarded: level.points,
        levelId: level.id,
        levelLabel: level.label,
      };
    }
    // A level that is not on this criterion — a rubric edited after marking
    // began. Treated as unmarked rather than as zero, because the marker did
    // choose something and the safe reading is that nobody has re-decided.
    return base;
  }

  if (typeof mark.points === "number" && Number.isFinite(mark.points)) {
    return { ...base, awarded: round2(Math.max(0, mark.points)) };
  }

  return base;
}

/** Score a whole rubric. */
export function scoreRubric(
  criteria: Criterion[],
  marks: Mark[]
): RubricResult {
  const byCriterion = new Map(marks.map((m) => [m.criterionId, m]));
  const results = criteria.map((c) => scoreCriterion(c, byCriterion.get(c.id)));

  let awarded = 0;
  let possible = 0;
  let outstanding = 0;

  for (const r of results) {
    possible += r.possible;
    if (r.awarded === null) outstanding++;
    else awarded += r.awarded;
  }

  const complete = criteria.length > 0 && outstanding === 0;

  return {
    criteria: results,
    awarded: round2(awarded),
    possible: round2(possible),
    complete,
    outstanding,
    // Withheld until the rubric is finished. A percentage over a partly
    // filled rubric is the same lie as counting unmarked work as zero.
    percentage: complete && possible > 0 ? round2((awarded / possible) * 100) : null,
  };
}

/**
 * The score this rubric implies for the assignment.
 *
 * Rescaled onto the assignment's own marks, because a rubric worth 16 points
 * attached to an assignment out of 20 must not quietly cap everyone at 16.
 * Returns null when the rubric is not finished or is not what decides the
 * score — in both cases the teacher's own number is the answer.
 */
export function rubricScoreFor(
  result: RubricResult,
  assignmentPoints: number | null,
  rubricScores: boolean
): number | null {
  if (!rubricScores || !result.complete || result.possible <= 0) return null;
  if (assignmentPoints === null) return result.awarded;
  return round2((result.awarded / result.possible) * assignmentPoints);
}

/**
 * Say what is left, in words.
 *
 * A marker looking at a long rubric wants to know whether they have finished
 * it, and counting rows themselves is the sort of small friction that makes
 * people stop using a feature.
 */
export function describeProgress(result: RubricResult): string {
  if (result.criteria.length === 0) return "This rubric has no criteria yet";
  if (result.complete) return `${result.awarded} of ${result.possible}`;
  if (result.outstanding === result.criteria.length) return "Not started";
  return `${result.outstanding} criterion${result.outstanding === 1 ? "" : "s"} left`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
