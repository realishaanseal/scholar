import { db } from "@/lib/db";

/**
 * What a class found hard, and how a teacher's own marking behaved.
 *
 * Both readings here are institutional: rubric marks a teacher recorded, and
 * the times at which they recorded them. Neither touches homework,
 * task_events, academic_profile, timetables or study sessions, and neither
 * takes a parameter that could be turned into such a read. A teacher learning
 * how their class did is a different question from a teacher learning how a
 * student spends their evenings, and only the first one is answerable here.
 *
 * The second reading is about the teacher rather than the students, which is
 * why it is shown to them and to nobody else. An administrator with a chart of
 * marking drift by staff member has a performance-management tool, and that is
 * not what this is for.
 */

/* ── What the class found hard ──────────────────────────────────────────── */

export type CriterionOutcome = {
  criterionId: string;
  title: string;
  /** Mean fraction of the criterion's points earned, 0-1. */
  share: number;
  earned: number;
  possible: number;
  /** How many marked submissions this is drawn from. */
  marked: number;
};

/** Below this a criterion is one afternoon's marking, not a finding. */
export const MIN_MARKED = 5;

/**
 * Per-criterion performance across one assignment's marked submissions.
 *
 * A teacher sees individual rubric marks while grading and has no view of the
 * column. The column is the reteaching signal: a criterion the whole class
 * lost marks on is a gap in what was taught, and a criterion two students lost
 * marks on is two students.
 *
 * Ordered weakest first, which is the opposite of the choice made for the
 * attendance register — and for the opposite reason. Ranking children by a
 * measure of themselves is a league table; ranking the parts of your own
 * assessment by how they went is the entire point of looking.
 */
export async function criterionOutcomes(
  assignmentId: string,
  organizationId: string
): Promise<CriterionOutcome[]> {
  const rows = await db
    .prepare(
      `SELECT rc.id AS criterion_id,
              rc.title,
              SUM(rm.points)::float8 AS earned,
              SUM(rc.points)::float8 AS possible,
              COUNT(*)::int AS marked
         FROM rubric_marks rm
         JOIN rubric_criteria rc ON rc.id = rm.criterion_id
         JOIN assignment_submissions s ON s.id = rm.submission_id
        WHERE s.assignment_id = ?
          AND s.organization_id = ?
          AND rm.points IS NOT NULL
          AND rc.points > 0
        GROUP BY rc.id, rc.title, rc.position
        ORDER BY rc.position`
    )
    .all(assignmentId, organizationId);

  return (rows as any[])
    .map((r) => {
      const earned = Number(r.earned ?? 0);
      const possible = Number(r.possible ?? 0);
      return {
        criterionId: r.criterion_id,
        title: r.title,
        earned,
        possible,
        marked: Number(r.marked ?? 0),
        share: possible > 0 ? earned / possible : 0,
      };
    })
    .filter((c) => c.possible > 0)
    .sort((a, b) => a.share - b.share);
}

/* ── How the marking itself went ────────────────────────────────────────── */

export type MarkingDay = {
  /** Calendar day the marks were recorded, YYYY-MM-DD. */
  day: string;
  marked: number;
  /** Mean fraction of available points awarded that day, 0-1. */
  share: number;
};

export type MarkingDrift = {
  days: MarkingDay[];
  /** Difference in mean share between the first and last day, or null. */
  spreadPoints: number | null;
};

/** Fewer sittings than this and there is no sequence to compare. */
export const MIN_SITTINGS = 2;
/** Below this a difference is ordinary variation between two piles of work. */
export const MIN_SPREAD = 0.08;

/**
 * Whether marks drifted across the days one assignment was marked over.
 *
 * Marking thirty scripts takes days, and the mark a script gets is known to
 * depend on when in that sequence it was read. A teacher cannot see their own
 * drift, because the evidence is spread across sittings they experienced one
 * at a time.
 *
 * Reported as a comparison and never as a correction. Scholar does not know
 * whether the difference is the marker or the scripts — a teacher who marked
 * the strongest work first will show the same shape as one who got harsher on
 * Thursday — so this says what happened and leaves the reading to the person
 * who was there. Anything else would be a machine adjusting grades on a
 * suspicion.
 */
export async function markingDrift(
  assignmentId: string,
  organizationId: string
): Promise<MarkingDrift> {
  const rows = await db
    .prepare(
      `SELECT to_char(rm.created_at, 'YYYY-MM-DD') AS day,
              COUNT(DISTINCT rm.submission_id)::int AS marked,
              SUM(rm.points)::float8 AS earned,
              SUM(rc.points)::float8 AS possible
         FROM rubric_marks rm
         JOIN rubric_criteria rc ON rc.id = rm.criterion_id
         JOIN assignment_submissions s ON s.id = rm.submission_id
        WHERE s.assignment_id = ?
          AND s.organization_id = ?
          AND rm.points IS NOT NULL
          AND rc.points > 0
        GROUP BY 1
        ORDER BY 1`
    )
    .all(assignmentId, organizationId);

  const days: MarkingDay[] = (rows as any[])
    .map((r) => {
      const possible = Number(r.possible ?? 0);
      return {
        day: r.day,
        marked: Number(r.marked ?? 0),
        share: possible > 0 ? Number(r.earned ?? 0) / possible : 0,
      };
    })
    .filter((d) => d.marked > 0);

  if (days.length < MIN_SITTINGS) return { days, spreadPoints: null };

  const spread = days[0].share - days[days.length - 1].share;
  return {
    days,
    spreadPoints: Math.abs(spread) >= MIN_SPREAD ? Math.round(spread * 1000) / 10 : null,
  };
}

/* ── Which assignments are worth looking at ─────────────────────────────── */

export type MarkedAssignment = { id: string; title: string; markedAt: string };

/**
 * Assignments in a section that have been marked against a rubric.
 *
 * Most recently marked first, because the one a teacher just finished is the
 * one they might still act on. An assignment with no rubric never appears —
 * there are no criteria to report, and a bare total says nothing about what to
 * reteach.
 */
export async function markedAssignments(
  sectionId: string,
  organizationId: string,
  limit = 4
): Promise<MarkedAssignment[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.title, MAX(rm.created_at) AS marked_at
         FROM assignments a
         JOIN assignment_submissions s ON s.assignment_id = a.id
         JOIN rubric_marks rm ON rm.submission_id = s.id
        WHERE a.course_section_id = ?
          AND a.organization_id = ?
          AND rm.points IS NOT NULL
        GROUP BY a.id, a.title
        ORDER BY MAX(rm.created_at) DESC
        LIMIT ?`
    )
    .all(sectionId, organizationId, limit);

  return (rows as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    markedAt: r.marked_at instanceof Date ? r.marked_at.toISOString() : String(r.marked_at),
  }));
}
