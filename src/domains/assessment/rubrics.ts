import { db, newId } from "@/lib/db";
import { scoreRubric, type Criterion, type Mark, type RubricResult } from "./rubric";

export * from "./rubric";

/**
 * Rubrics, stored and read back.
 *
 * A rubric is loaded whole — criteria and their levels together — because
 * every screen that wants one wants all of it, and fetching criteria then
 * looping for levels is how a rubric with eight criteria costs nine round
 * trips to draw once.
 */

export type StoredRubric = {
  id: string;
  courseId: string | null;
  title: string;
  description: string;
  criteria: Criterion[];
  /** Everything the rubric is worth, summed from its criteria. */
  points: number;
};

const CRITERION_SQL = `
  SELECT c.id, c.title, c.description, c.points, c.position,
         l.id AS level_id, l.label, l.points AS level_points, l.position AS level_position
    FROM rubric_criteria c
    LEFT JOIN rubric_levels l ON l.criterion_id = c.id
   WHERE c.rubric_id = ?
   ORDER BY c.position, c.id, l.position, l.id`;

/** Assemble criteria and their levels from one flat join. */
async function criteriaOf(rubricId: string): Promise<Criterion[]> {
  const rows = await db.prepare(CRITERION_SQL).all(rubricId);

  const byId = new Map<string, Criterion>();
  for (const r of rows as any[]) {
    let c = byId.get(r.id);
    if (!c) {
      c = { id: r.id, title: r.title, points: Number(r.points ?? 0), levels: [] };
      byId.set(r.id, c);
    }
    if (r.level_id) {
      c.levels.push({
        id: r.level_id,
        label: r.label,
        points: Number(r.level_points ?? 0),
      });
    }
  }
  return [...byId.values()];
}

export async function getRubric(id: string): Promise<StoredRubric | null> {
  const r = await db
    .prepare(`SELECT id, course_id, title, description FROM rubrics WHERE id = ?`)
    .get(id);
  if (!r) return null;

  const criteria = await criteriaOf(id);
  return {
    id: (r as any).id,
    courseId: (r as any).course_id ?? null,
    title: (r as any).title,
    description: (r as any).description ?? "",
    criteria,
    points: criteria.reduce((sum, c) => sum + c.points, 0),
  };
}

/**
 * Rubrics a teacher may use here.
 *
 * The course's own, plus the institution's shared ones. A rubric scoped to
 * another course is deliberately absent: reuse across a department is what
 * institution scope is for, and a picker listing every rubric in the school
 * is a picker nobody scrolls.
 */
export async function listUsableRubrics(
  organizationId: string,
  courseId: string
): Promise<Array<{ id: string; title: string; points: number; shared: boolean }>> {
  const rows = await db
    .prepare(
      `SELECT r.id, r.title, r.course_id,
              COALESCE(SUM(c.points), 0) AS points
         FROM rubrics r
         LEFT JOIN rubric_criteria c ON c.rubric_id = r.id
        WHERE r.organization_id = ?
          AND (r.course_id = ? OR r.course_id IS NULL)
        GROUP BY r.id, r.title, r.course_id
        ORDER BY r.updated_at DESC`
    )
    .all(organizationId, courseId);

  return (rows as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    points: Number(r.points ?? 0),
    shared: r.course_id === null,
  }));
}

export type RubricInput = {
  title: string;
  description?: string;
  courseId: string | null;
  criteria: Array<{
    title: string;
    description?: string;
    points: number;
    levels: Array<{ label: string; description?: string; points: number }>;
  }>;
};

/**
 * Create a rubric, criteria and levels together.
 *
 * One call because a rubric with no criteria is not a half-built rubric, it
 * is an empty row — and an interface that saved the title first and then
 * failed would leave one behind on every mistake.
 */
export async function createRubric(
  organizationId: string,
  createdBy: string,
  input: RubricInput
): Promise<StoredRubric> {
  const rubricId = newId();

  await db
    .prepare(
      `INSERT INTO rubrics (id, organization_id, course_id, title, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      rubricId, organizationId, input.courseId, input.title,
      input.description ?? "", createdBy
    );

  for (const [i, c] of input.criteria.entries()) {
    const criterionId = newId();
    await db
      .prepare(
        `INSERT INTO rubric_criteria
           (id, organization_id, rubric_id, title, description, points, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        criterionId, organizationId, rubricId, c.title,
        c.description ?? "", c.points, i
      );

    for (const [j, l] of c.levels.entries()) {
      await db
        .prepare(
          `INSERT INTO rubric_levels
             (id, organization_id, criterion_id, label, description, points, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(newId(), organizationId, criterionId, l.label, l.description ?? "", l.points, j);
    }
  }

  const out = await getRubric(rubricId);
  if (!out) throw new Error("The rubric was created but could not be read back.");
  return out;
}

/* ── Marking against one ───────────────────────────────────────────────── */

/** What a marker has decided so far on one submission. */
export async function marksFor(submissionId: string): Promise<Mark[]> {
  const rows = await db
    .prepare(
      `SELECT criterion_id, level_id, points, comment
         FROM rubric_marks WHERE submission_id = ?`
    )
    .all(submissionId);

  return (rows as any[]).map((r) => ({
    criterionId: r.criterion_id,
    levelId: r.level_id ?? null,
    points: r.points === null || r.points === undefined ? null : Number(r.points),
    comment: r.comment ?? "",
  }));
}

/**
 * Record one criterion's judgement.
 *
 * Upserted per criterion rather than replacing the whole set, so two markers
 * moderating the same piece do not overwrite each other's rows wholesale —
 * and so a marker who changes their mind about one criterion does not lose
 * the comments they wrote on the others.
 */
export async function recordMark(input: {
  organizationId: string;
  submissionId: string;
  criterionId: string;
  levelId: string | null;
  points: number | null;
  comment: string;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rubric_marks
         (id, organization_id, submission_id, criterion_id, level_id, points, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (submission_id, criterion_id)
       DO UPDATE SET level_id = excluded.level_id,
                     points   = excluded.points,
                     comment  = excluded.comment,
                     created_at = now()`
    )
    .run(
      newId(), input.organizationId, input.submissionId, input.criterionId,
      input.levelId, input.points, input.comment
    );
}

/** The rubric result for one submission, ready to display. */
export async function assessmentFor(
  submissionId: string,
  rubricId: string
): Promise<{ rubric: StoredRubric; result: RubricResult } | null> {
  const rubric = await getRubric(rubricId);
  if (!rubric) return null;
  return { rubric, result: scoreRubric(rubric.criteria, await marksFor(submissionId)) };
}
