import { db } from "@/lib/db";

/**
 * Things Scholar can tell a student that nothing else can.
 *
 * Each of these is a join no other system has available. Rubric marks stored
 * per criterion, attendance, and a student's own measured pace all exist in
 * one database, and the questions below are what happens when you ask them
 * together rather than one screen at a time.
 *
 * The line held throughout: these are a student's own records, told back to
 * the student. Nothing here is offered to an administrator, and nothing here
 * is a prediction about a person. "You lost most marks on structure" is a
 * fact about six essays. "You are likely to struggle" would be a claim about
 * a child, and it is not something this file computes.
 */

/* ── What you keep losing marks on ─────────────────────────────────────── */

export type CriterionPattern = {
  criterionId: string;
  title: string;
  /** How many marked pieces of work included this criterion. */
  occasions: number;
  earned: number;
  possible: number;
  /** Share of the available marks earned on this criterion, 0-100. */
  percentage: number;
  /** Courses this criterion has appeared in, for context. */
  courses: string[];
};

export type CriterionInsight = {
  patterns: CriterionPattern[];
  /** The weakest criterion, when there is enough evidence to name one. */
  weakest: CriterionPattern | null;
  /** Average across everything else, for comparison. */
  averageElsewhere: number | null;
};

/**
 * The minimum evidence before naming a weakness.
 *
 * Three occasions. Telling somebody they are weak at structure on the
 * strength of one essay is not an insight, it is a bad afternoon repeated
 * back to them with false authority.
 */
export const MIN_OCCASIONS = 3;

/**
 * Where a student's marks actually go.
 *
 * Canvas has Outcomes and a mastery gradebook, and they report per outcome
 * inside one course. Nobody tells a student the pattern *across* their
 * subjects — that structure is where they lose marks in English and in
 * History alike, while their use of evidence is fine in both. That is the
 * sentence that changes what somebody does next week, and it is available
 * here only because rubric marks are rows rather than a blob.
 *
 * Criteria are matched by title rather than id on purpose. "Structure" on the
 * English rubric and "Structure" on the History rubric are different rows and
 * the same skill, and a student does not experience them as separate.
 */
export async function criterionPatterns(
  userId: string,
  organizationId: string
): Promise<CriterionInsight> {
  const rows = await db
    .prepare(
      `SELECT lower(trim(rc.title)) AS key,
              MIN(rc.title) AS title,
              COUNT(*)::int AS occasions,
              SUM(rm.points)::float8 AS earned,
              SUM(rc.points)::float8 AS possible,
              ARRAY_AGG(DISTINCT c.code) AS courses
         FROM rubric_marks rm
         JOIN rubric_criteria rc ON rc.id = rm.criterion_id
         JOIN assignment_submissions s ON s.id = rm.submission_id
         JOIN assignments a ON a.id = s.assignment_id
         JOIN course_sections cs ON cs.id = a.course_section_id
         JOIN courses c ON c.id = cs.course_id
        WHERE s.user_id = ?
          AND s.organization_id = ?
          -- Released marks only. A student must not learn their result from
          -- a pattern before their teacher has returned the work.
          AND s.posted_at IS NOT NULL
          AND rm.points IS NOT NULL
          AND rc.points > 0
        GROUP BY lower(trim(rc.title))
        HAVING SUM(rc.points) > 0
        ORDER BY (SUM(rm.points) / SUM(rc.points)) ASC`
    )
    .all(userId, organizationId);

  const patterns: CriterionPattern[] = (rows as any[]).map((r) => ({
    criterionId: String(r.key),
    title: String(r.title ?? ""),
    occasions: Number(r.occasions ?? 0),
    earned: round2(Number(r.earned ?? 0)),
    possible: round2(Number(r.possible ?? 0)),
    percentage: round2((Number(r.earned ?? 0) / Number(r.possible || 1)) * 100),
    courses: (r.courses ?? []).filter(Boolean),
  }));

  // Only name a weakness with enough behind it, and only when it is actually
  // adrift of the rest. A student whose criteria all sit within a few points
  // of each other has no weakest area worth telling them about.
  const eligible = patterns.filter((p) => p.occasions >= MIN_OCCASIONS);
  const weakest = eligible[0] ?? null;

  const others = eligible.slice(1);
  const averageElsewhere = others.length
    ? round2(others.reduce((sum, p) => sum + p.percentage, 0) / others.length)
    : null;

  const adrift =
    weakest && averageElsewhere !== null && averageElsewhere - weakest.percentage >= 10;

  return {
    patterns,
    weakest: adrift ? weakest : null,
    averageElsewhere,
  };
}

/* ── What you missed ───────────────────────────────────────────────────── */

export type MissedDay = {
  date: string;
  courseCode: string;
  sectionId: string;
  state: string;
  /** Work set on or around that day. */
  assignments: Array<{ id: string; title: string; dueAt: string | null }>;
  /** Materials published while they were out. */
  materials: Array<{ id: string; title: string; kind: string }>;
};

/**
 * Catching up after an absence.
 *
 * Every LMS has attendance and every LMS has coursework, and none of them
 * joins the two. A student who was off on Tuesday has to work out for
 * themselves what they missed, which is precisely the task somebody returning
 * from illness is least equipped to do.
 *
 * Only unauthorised and authorised absence, not lateness: arriving late is
 * not missing a day, and offering somebody a catch-up list for a lesson they
 * attended is noise.
 */
export async function whatYouMissed(
  userId: string,
  organizationId: string,
  sinceDays = 21
): Promise<MissedDay[]> {
  const rows = await db
    .prepare(
      `SELECT s.on_date, s.course_section_id, m.state, c.code
         FROM attendance_marks m
         JOIN attendance_sessions s ON s.id = m.session_id
         JOIN course_sections cs ON cs.id = s.course_section_id
         JOIN courses c ON c.id = cs.course_id
        WHERE m.user_id = ?
          AND cs.organization_id = ?
          AND m.state IN ('absent', 'excused')
          AND s.on_date >= (CURRENT_DATE - make_interval(days => ?))
        ORDER BY s.on_date DESC`
    )
    .all(userId, organizationId, sinceDays);

  const out: MissedDay[] = [];

  for (const r of rows as any[]) {
    const date = r.on_date instanceof Date
      ? r.on_date.toISOString().slice(0, 10)
      : String(r.on_date).slice(0, 10);

    // Work set that day, and material published that day. A one-day window
    // rather than a range: a student wants to know what happened in the
    // lesson they missed, not everything that happened that week.
    const [assignments, materials] = await Promise.all([
      db
        .prepare(
          `SELECT id, title, due_at FROM assignments
            WHERE course_section_id = ?
              AND status = 'published'
              AND created_at::date = ?::date
            ORDER BY created_at`
        )
        .all(r.course_section_id, date),
      db
        .prepare(
          `SELECT m.id, m.title, m.kind
             FROM course_materials m
             JOIN course_sections cs ON cs.course_id = m.course_id
            WHERE cs.id = ? AND m.is_published
              AND m.created_at::date = ?::date
            ORDER BY m.created_at`
        )
        .all(r.course_section_id, date),
    ]);

    // A day where nothing was set and nothing published is a day with nothing
    // to catch up on, and listing it would make the feature feel like noise.
    if ((assignments as any[]).length === 0 && (materials as any[]).length === 0) continue;

    out.push({
      date,
      courseCode: String(r.code ?? ""),
      sectionId: r.course_section_id,
      state: String(r.state),
      assignments: (assignments as any[]).map((a) => ({
        id: a.id,
        title: a.title,
        dueAt: a.due_at instanceof Date ? a.due_at.toISOString() : a.due_at ?? null,
      })),
      materials: (materials as any[]).map((m) => ({
        id: m.id, title: m.title, kind: m.kind,
      })),
    });
  }

  return out;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
