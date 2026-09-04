import { db, newId } from "@/lib/db";
import { courseGrade, type Category, type CourseGrade, type GradedItem } from "./compute";

export * from "./compute";

/**
 * The gradebook.
 *
 * Reads are shaped around the two questions people actually ask: a teacher
 * wants the whole class at once, and a student wants only themselves. Those
 * are different queries rather than one with a filter, so the student one
 * cannot be handed the wrong argument and return the class.
 */

/* ── Categories ────────────────────────────────────────────────────────── */

export async function listCategories(courseId: string): Promise<Category[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, weight FROM grade_categories
        WHERE course_id = ? ORDER BY position, name`
    )
    .all(courseId);
  return rows.map((r: any) => ({ id: r.id, name: r.name, weight: Number(r.weight) }));
}

export async function createCategory(
  organizationId: string,
  courseId: string,
  name: string,
  weight: number
): Promise<Category> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO grade_categories (id, organization_id, course_id, name, weight, position)
       VALUES (?, ?, ?, ?, ?, COALESCE(
         (SELECT MAX(position) + 1 FROM grade_categories WHERE course_id = ?), 0))`
    )
    .run(id, organizationId, courseId, name, weight, courseId);
  return { id, name, weight };
}

/* ── The class gradebook ───────────────────────────────────────────────── */

export type GradebookColumn = {
  assignmentId: string;
  title: string;
  points: number | null;
  categoryId: string | null;
  dueAt: string | null;
};

export type GradebookRow = {
  userId: string;
  email: string | null;
  name: string | null;
  cells: Record<string, { score: number | null; status: string | null; isLate: boolean }>;
  grade: CourseGrade;
};

export type Gradebook = {
  columns: GradebookColumn[];
  rows: GradebookRow[];
  categories: Category[];
};

/**
 * The whole class, in one grid.
 *
 * Three queries rather than one per student: a class of thirty with twelve
 * assignments would otherwise be three hundred and sixty round trips to draw
 * one table.
 */
export async function sectionGradebook(
  sectionId: string,
  courseId: string
): Promise<Gradebook> {
  const [columnRows, enrolledRows, scoreRows, categories] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, points, grade_category_id, due_at
           FROM assignments
          WHERE course_section_id = ? AND status = 'published'
          ORDER BY due_at NULLS LAST, created_at`
      )
      .all(sectionId),
    db
      .prepare(
        `SELECT e.user_id, u.email, u.name
           FROM enrollments e
           JOIN users u ON u.id = e.user_id
          WHERE e.course_section_id = ? AND e.status = 'active'
          ORDER BY u.name NULLS LAST, u.email`
      )
      .all(sectionId),
    db
      .prepare(
        `SELECT s.user_id, s.assignment_id, s.score, s.status, s.is_late
           FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
          WHERE a.course_section_id = ?`
      )
      .all(sectionId),
    listCategories(courseId),
  ]);

  const columns: GradebookColumn[] = columnRows.map((r: any) => ({
    assignmentId: r.id,
    title: r.title,
    points: r.points === null || r.points === undefined ? null : Number(r.points),
    categoryId: r.grade_category_id ?? null,
    dueAt: r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at ?? null,
  }));

  const byStudent = new Map<string, Map<string, any>>();
  for (const s of scoreRows as any[]) {
    if (!byStudent.has(s.user_id)) byStudent.set(s.user_id, new Map());
    byStudent.get(s.user_id)!.set(s.assignment_id, s);
  }

  const now = Date.now();

  const rows: GradebookRow[] = (enrolledRows as any[]).map((e) => {
    const subs = byStudent.get(e.user_id) ?? new Map();
    const cells: GradebookRow["cells"] = {};
    const items: GradedItem[] = [];

    for (const col of columns) {
      const s = subs.get(col.assignmentId);
      cells[col.assignmentId] = {
        score: s?.score === null || s?.score === undefined ? null : Number(s.score),
        status: s?.status ?? null,
        isLate: Boolean(s?.is_late),
      };

      // Missing means the deadline has passed with nothing handed in. Work
      // that is merely not due yet is neither missing nor marked.
      const overdue = Boolean(col.dueAt && Date.parse(col.dueAt) < now);
      items.push({
        assignmentId: col.assignmentId,
        categoryId: col.categoryId,
        points: col.points,
        score: s?.score === null || s?.score === undefined ? null : Number(s.score),
        missing: !s && overdue,
      });
    }

    return {
      userId: e.user_id,
      email: e.email ?? null,
      name: e.name ?? null,
      cells,
      grade: courseGrade(items, categories),
    };
  });

  return { columns, rows, categories };
}

/**
 * One student's own standing in one course.
 *
 * Deliberately not `sectionGradebook(...).rows.find(...)`: a function that
 * loads the whole class in order to return one row is one refactor away from
 * returning the whole class.
 */
export async function studentGrade(
  sectionId: string,
  courseId: string,
  userId: string
): Promise<CourseGrade> {
  const [rows, categories] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.points, a.grade_category_id, a.due_at, s.score
           FROM assignments a
           LEFT JOIN LATERAL (
             -- Only released marks. Counting a withheld one would let a
             -- student work it out from their own percentage, which is the
             -- same disclosure by a slower route.
             SELECT score FROM assignment_submissions x
              WHERE x.assignment_id = a.id AND x.user_id = ?
                AND x.posted_at IS NOT NULL
              ORDER BY x.attempt DESC LIMIT 1
           ) s ON true
          WHERE a.course_section_id = ? AND a.status = 'published'`
      )
      .all(userId, sectionId),
    listCategories(courseId),
  ]);

  const now = Date.now();
  const items: GradedItem[] = (rows as any[]).map((r) => {
    const due = r.due_at instanceof Date ? r.due_at.getTime() : r.due_at ? Date.parse(r.due_at) : null;
    return {
      assignmentId: r.id,
      categoryId: r.grade_category_id ?? null,
      points: r.points === null || r.points === undefined ? null : Number(r.points),
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      missing: r.score === null && due !== null && due < now,
    };
  });

  return courseGrade(items, categories);
}

/* ── The audit trail ───────────────────────────────────────────────────── */

export type GradeEvent = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  previousScore: number | null;
  newScore: number | null;
  previousFeedback: string | null;
  newFeedback: string | null;
  aiModel: string | null;
  createdAt: string;
};

/**
 * Record a change to a mark.
 *
 * Append-only: nothing in this codebase updates or deletes a grade event, so
 * the history of a contested grade cannot be tidied away by the person being
 * contested. `actorUserId` is required by the signature — there is no way to
 * write a grade change with nobody attached to it, which is what makes "AI
 * never silently finalises a grade" a property of the schema rather than a
 * promise in a document.
 */
export async function recordGradeEvent(input: {
  organizationId: string;
  submissionId: string;
  actorUserId: string;
  action: "graded" | "regraded" | "cleared";
  previousScore: number | null;
  newScore: number | null;
  previousFeedback: string | null;
  newFeedback: string | null;
  /** The model that drafted this, when one did. Null means unaided. */
  aiModel?: string | null;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grade_events
         (id, organization_id, submission_id, actor_user_id, action,
          previous_score, new_score, previous_feedback, new_feedback, ai_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newId(), input.organizationId, input.submissionId, input.actorUserId, input.action,
      input.previousScore, input.newScore, input.previousFeedback, input.newFeedback,
      input.aiModel ?? null
    );
}

/** The history of one mark, newest first — what an appeal actually reads. */
export async function gradeHistory(submissionId: string): Promise<GradeEvent[]> {
  const rows = await db
    .prepare(
      `SELECT g.id, g.actor_user_id, u.email AS actor_email, g.action,
              g.previous_score, g.new_score, g.previous_feedback, g.new_feedback,
              g.ai_model, g.created_at
         FROM grade_events g
         LEFT JOIN users u ON u.id = g.actor_user_id
        WHERE g.submission_id = ?
        ORDER BY g.created_at DESC`
    )
    .all(submissionId);

  return rows.map((r: any) => ({
    id: r.id,
    actorUserId: r.actor_user_id ?? null,
    actorEmail: r.actor_email ?? null,
    action: r.action,
    previousScore: num(r.previous_score),
    newScore: num(r.new_score),
    previousFeedback: r.previous_feedback ?? null,
    newFeedback: r.new_feedback ?? null,
    aiModel: r.ai_model ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
