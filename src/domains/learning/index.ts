import { db } from "@/lib/db";

/**
 * The student's side of an institution.
 *
 * Everything here is scoped to one student's own enrolment, which is why the
 * queries take a userId and join through `enrollments` rather than taking a
 * section and filtering afterwards. A query that cannot express "someone
 * else's course" is a query that cannot leak one.
 *
 * Kept apart from the teaching domain deliberately. The two views of the same
 * assignment differ in almost every respect — a teacher sees drafts, a roster
 * and a marking queue; a student sees published work, their own attempts and
 * their own marks — and sharing one function between them means every call
 * site carrying a flag about who is asking. That flag is exactly the thing
 * that gets passed wrong.
 */

export type EnrolledCourse = {
  sectionId: string;
  organizationId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  termName: string;
  organizationName: string;
  /** Published work in this section. */
  assignmentCount: number;
  /** Published work with nothing submitted yet. */
  outstanding: number;
  materialCount: number;
};

/**
 * The courses this student is actually in.
 *
 * `outstanding` is the number worth showing: a course with three published
 * assignments and nothing owed is a calmer thing than the same course with
 * three pieces of work waiting, and the totals cannot tell them apart.
 */
export async function listEnrolledCourses(userId: string): Promise<EnrolledCourse[]> {
  const rows = await db
    .prepare(
      `SELECT cs.id AS section_id, cs.organization_id, cs.course_id, cs.name AS section_name,
              c.code AS course_code, c.title AS course_title,
              t.name AS term_name, o.name AS organization_name,
              (SELECT COUNT(*)::int FROM assignments a
                WHERE a.course_section_id = cs.id AND a.status = 'published') AS assignment_count,
              (SELECT COUNT(*)::int FROM assignments a
                WHERE a.course_section_id = cs.id AND a.status = 'published'
                  AND NOT EXISTS (
                    SELECT 1 FROM assignment_submissions s
                     WHERE s.assignment_id = a.id AND s.user_id = e.user_id
                       AND s.status IN ('submitted', 'returned')
                  )) AS outstanding,
              (SELECT COUNT(*)::int FROM course_materials m
                WHERE m.course_id = cs.course_id AND m.is_published) AS material_count
         FROM enrollments e
         JOIN course_sections cs ON cs.id = e.course_section_id
         JOIN courses c ON c.id = cs.course_id
         JOIN terms t ON t.id = cs.term_id
         JOIN organizations o ON o.id = cs.organization_id
        WHERE e.user_id = ? AND e.status = 'active'
        ORDER BY c.code, cs.name`
    )
    .all(userId);

  return rows.map((r: any) => ({
    sectionId: r.section_id,
    organizationId: r.organization_id,
    courseId: r.course_id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    sectionName: r.section_name,
    termName: r.term_name,
    organizationName: r.organization_name,
    assignmentCount: r.assignment_count,
    outstanding: r.outstanding,
    materialCount: r.material_count,
  }));
}

/** Is this student actively enrolled in this section? */
export async function isEnrolledIn(userId: string, sectionId: string): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT 1 AS present FROM enrollments
        WHERE user_id = ? AND course_section_id = ? AND status = 'active'`
    )
    .get(userId, sectionId);
  return Boolean(r);
}

export type StudentAssignment = {
  id: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  closesAt: string | null;
  availableFrom: string | null;
  points: number | null;
  latePolicy: "accept" | "penalise" | "reject";
  submissionType: string;
  maxAttempts: number | null;
  /** The student's own latest attempt, if any. */
  submission: {
    id: string;
    attempt: number;
    status: string;
    body: string;
    url: string | null;
    submittedAt: string | null;
    isLate: boolean;
    score: number | null;
    feedback: string;
    gradedAt: string | null;
  } | null;
  attachmentCount: number;
  kind: "task" | "quiz";
};

/**
 * Published work in a section, with this student's own attempt attached.
 *
 * The submission is joined in rather than fetched per assignment, because a
 * list of twelve assignments should not be thirteen queries. Only the latest
 * attempt is carried: earlier ones matter on the assignment's own page, not in
 * a list.
 */
export async function listStudentAssignments(
  sectionId: string,
  userId: string
): Promise<StudentAssignment[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.title, a.instructions, a.due_at, a.closes_at, a.available_from, a.kind,
              a.points, a.late_policy, a.submission_type, a.max_attempts,
              s.id AS submission_id, s.attempt, s.status AS submission_status,
              s.body, s.url, s.submitted_at, s.is_late, s.graded_at,
              -- A mark and its feedback are withheld together until the
              -- teacher releases them. Nulled in the query rather than
              -- filtered afterwards, so no code path can forget.
              CASE WHEN s.posted_at IS NOT NULL THEN s.score END AS score,
              CASE WHEN s.posted_at IS NOT NULL THEN s.feedback ELSE '' END AS feedback,
              s.posted_at,
              (SELECT COUNT(*)::int FROM assignment_files af
                WHERE af.assignment_id = a.id) AS attachment_count
         FROM assignments a
         LEFT JOIN LATERAL (
           SELECT * FROM assignment_submissions x
            WHERE x.assignment_id = a.id AND x.user_id = ?
            ORDER BY x.attempt DESC LIMIT 1
         ) s ON true
        WHERE a.course_section_id = ? AND a.status = 'published'
        ORDER BY a.due_at NULLS LAST, a.created_at`
    )
    .all(userId, sectionId);

  return rows.map(mapStudentAssignment);
}

/** One assignment, as its student sees it. */
export async function getStudentAssignment(
  assignmentId: string,
  userId: string
): Promise<StudentAssignment | null> {
  const r = await db
    .prepare(
      `SELECT a.id, a.title, a.instructions, a.due_at, a.closes_at, a.available_from, a.kind,
              a.points, a.late_policy, a.submission_type, a.max_attempts,
              s.id AS submission_id, s.attempt, s.status AS submission_status,
              s.body, s.url, s.submitted_at, s.is_late, s.graded_at,
              -- A mark and its feedback are withheld together until the
              -- teacher releases them. Nulled in the query rather than
              -- filtered afterwards, so no code path can forget.
              CASE WHEN s.posted_at IS NOT NULL THEN s.score END AS score,
              CASE WHEN s.posted_at IS NOT NULL THEN s.feedback ELSE '' END AS feedback,
              s.posted_at,
              (SELECT COUNT(*)::int FROM assignment_files af
                WHERE af.assignment_id = a.id) AS attachment_count
         FROM assignments a
         LEFT JOIN LATERAL (
           SELECT * FROM assignment_submissions x
            WHERE x.assignment_id = a.id AND x.user_id = ?
            ORDER BY x.attempt DESC LIMIT 1
         ) s ON true
        WHERE a.id = ? AND a.status = 'published'`
    )
    .get(userId, assignmentId);

  return r ? mapStudentAssignment(r) : null;
}

function mapStudentAssignment(r: any): StudentAssignment {
  return {
    id: r.id,
    title: r.title,
    instructions: r.instructions ?? "",
    dueAt: iso(r.due_at),
    closesAt: iso(r.closes_at),
    availableFrom: iso(r.available_from),
    points: r.points === null || r.points === undefined ? null : Number(r.points),
    latePolicy: r.late_policy,
    submissionType: r.submission_type,
    maxAttempts: r.max_attempts ?? null,
    attachmentCount: r.attachment_count ?? 0,
    kind: r.kind ?? "task",
    submission: r.submission_id
      ? {
          id: r.submission_id,
          attempt: r.attempt,
          status: r.submission_status,
          body: r.body ?? "",
          url: r.url ?? null,
          submittedAt: iso(r.submitted_at),
          isLate: Boolean(r.is_late),
          score: r.score === null || r.score === undefined ? null : Number(r.score),
          feedback: r.feedback ?? "",
          gradedAt: iso(r.graded_at),
        }
      : null,
  };
}

/**
 * The section a task was projected from.
 *
 * Lets a Scholar task on the dashboard link back to the coursework it came
 * from — the single most obvious thing to want from a task that says
 * "PHY101 — Problem set 4" and, until now, went nowhere.
 */
export async function sectionOfAssignment(
  assignmentId: string
): Promise<{ sectionId: string; courseCode: string } | null> {
  const r = await db
    .prepare(
      `SELECT cs.id AS section_id, c.code AS course_code
         FROM assignments a
         JOIN course_sections cs ON cs.id = a.course_section_id
         JOIN courses c ON c.id = cs.course_id
        WHERE a.id = ?`
    )
    .get(assignmentId);
  return r ? { sectionId: r.section_id, courseCode: r.course_code } : null;
}

/** Is this person enrolled anywhere at all? Decides whether Courses is offered. */
export async function isEnrolledAnywhere(userId: string): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT 1 AS present FROM enrollments WHERE user_id = ? AND status = 'active' LIMIT 1`
    )
    .get(userId);
  return Boolean(r);
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
