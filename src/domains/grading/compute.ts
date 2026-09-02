/**
 * Turning marks into a grade.
 *
 * Pure, and separate from every query, because this is the arithmetic a
 * student will one day ask a teacher to justify. It has to be inspectable, and
 * it has to be testable without a database.
 *
 * Two decisions shape all of it:
 *
 * Ungraded work is not zero. A piece of work nobody has marked yet says
 * nothing about how a student is doing, and counting it as zero makes every
 * grade wrong for as long as marking takes — a student who has done
 * everything and been marked on half would see 50%. Unmarked work is excluded
 * from the total until a mark exists. Work that was never handed in is a
 * different thing: that IS a zero, and the caller distinguishes them.
 *
 * A grade is a fraction of what has been assessed so far, and saying so is
 * more honest than implying a final position mid-term.
 */

export type GradedItem = {
  assignmentId: string;
  categoryId: string | null;
  /** What the work is out of. Null means it carries no marks. */
  points: number | null;
  /** The mark awarded, or null when it has not been marked. */
  score: number | null;
  /** True when the deadline passed with nothing handed in. */
  missing: boolean;
};

export type Category = {
  id: string;
  name: string;
  /** Percentage of the final grade. */
  weight: number;
};

export type CategoryResult = {
  categoryId: string | null;
  name: string;
  weight: number;
  earned: number;
  possible: number;
  /** Null when nothing in this category has been assessed yet. */
  percentage: number | null;
  counted: number;
  awaiting: number;
};

export type CourseGrade = {
  /** Null when nothing has been assessed at all. */
  percentage: number | null;
  earned: number;
  possible: number;
  /** Marked, and therefore counted. */
  counted: number;
  /** Submitted or due, but not yet marked. */
  awaiting: number;
  missing: number;
  categories: CategoryResult[];
  /**
   * True when categories exist but their weights do not total 100. The grade
   * is still computed — over the weights that do exist — because refusing to
   * show anything while a teacher is half way through configuring the course
   * helps nobody.
   */
  weightsIncomplete: boolean;
};

/** Does this item contribute to a total? Only marked work with marks available. */
function isAssessed(item: GradedItem): boolean {
  return item.points !== null && item.points > 0 && (item.score !== null || item.missing);
}

/** A missing piece of work scores zero; a marked one scores its mark. */
function effectiveScore(item: GradedItem): number {
  if (item.missing && item.score === null) return 0;
  return item.score ?? 0;
}

/**
 * The grade for one course.
 *
 * With categories, each is averaged on its own and then weighted — which is
 * what a syllabus saying "exams 60%" actually means. Without them, it is a
 * straight points total.
 */
export function courseGrade(items: GradedItem[], categories: Category[]): CourseGrade {
  const assessed = items.filter(isAssessed);
  const awaiting = items.filter(
    (i) => !i.missing && i.score === null && i.points !== null && i.points > 0
  ).length;
  const missing = items.filter((i) => i.missing && i.score === null).length;

  const earned = assessed.reduce((n, i) => n + effectiveScore(i), 0);
  const possible = assessed.reduce((n, i) => n + (i.points ?? 0), 0);

  // No categories: a straight points total, which is what most courses do.
  if (categories.length === 0) {
    return {
      percentage: possible > 0 ? round2((earned / possible) * 100) : null,
      earned: round2(earned),
      possible: round2(possible),
      counted: assessed.length,
      awaiting,
      missing,
      categories: [],
      weightsIncomplete: false,
    };
  }

  const results: CategoryResult[] = categories.map((c) => {
    const inCategory = assessed.filter((i) => i.categoryId === c.id);
    const e = inCategory.reduce((n, i) => n + effectiveScore(i), 0);
    const p = inCategory.reduce((n, i) => n + (i.points ?? 0), 0);
    return {
      categoryId: c.id,
      name: c.name,
      weight: c.weight,
      earned: round2(e),
      possible: round2(p),
      percentage: p > 0 ? round2((e / p) * 100) : null,
      counted: inCategory.length,
      awaiting: items.filter(
        (i) => i.categoryId === c.id && !i.missing && i.score === null && (i.points ?? 0) > 0
      ).length,
    };
  });

  // Work in no category still has to count for something, so it forms an
  // implicit category carrying whatever weight the named ones leave unclaimed.
  const uncategorised = assessed.filter((i) => i.categoryId === null);
  const namedWeight = categories.reduce((n, c) => n + c.weight, 0);
  const leftover = Math.max(0, 100 - namedWeight);

  if (uncategorised.length > 0) {
    const e = uncategorised.reduce((n, i) => n + effectiveScore(i), 0);
    const p = uncategorised.reduce((n, i) => n + (i.points ?? 0), 0);
    results.push({
      categoryId: null,
      name: "Other work",
      weight: leftover,
      earned: round2(e),
      possible: round2(p),
      percentage: p > 0 ? round2((e / p) * 100) : null,
      counted: uncategorised.length,
      awaiting: items.filter(
        (i) => i.categoryId === null && !i.missing && i.score === null && (i.points ?? 0) > 0
      ).length,
    });
  }

  // Only categories with something assessed in them contribute, and the
  // weights are renormalised over those. Otherwise a course whose exam has
  // not happened yet would show every student failing.
  const contributing = results.filter((r) => r.percentage !== null && r.weight > 0);
  const totalWeight = contributing.reduce((n, r) => n + r.weight, 0);

  const percentage =
    totalWeight > 0
      ? round2(
          contributing.reduce((n, r) => n + (r.percentage as number) * r.weight, 0) / totalWeight
        )
      : null;

  return {
    percentage,
    earned: round2(earned),
    possible: round2(possible),
    counted: assessed.length,
    awaiting,
    missing,
    categories: results,
    weightsIncomplete: Math.abs(namedWeight + (uncategorised.length > 0 ? leftover : 0) - 100) > 0.01,
  };
}

/**
 * Two decimal places, without the floating-point tail.
 *
 * A grade shown as 86.66999999999999 is a grade nobody trusts.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * How a percentage should read.
 *
 * Not a letter grade: those are institution-specific, and inventing an
 * A–F scale here would quietly impose an American convention on schools that
 * do not use one. This is only the wording the interface uses.
 */
export function describeGrade(g: CourseGrade): string {
  if (g.percentage === null) {
    return g.awaiting > 0 ? "Nothing marked yet" : "No marked work";
  }
  const of = g.counted === 1 ? "1 piece" : `${g.counted} pieces`;
  return `${g.percentage}% across ${of} of marked work`;
}
