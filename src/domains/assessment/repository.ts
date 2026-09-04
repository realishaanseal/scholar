import { db, newId, nowISO } from "@/lib/db";
import { ensureSubject } from "@/lib/queries";
import { recordGradeEvent } from "@/domains/grading";
import {
  ARCHIVE_TASK_SQL, UPSERT_TASK_SQL,
  projectedFields, shouldProject, type ProjectableAssignment,
} from "./projection";
import type { Assignment, CreateAssignmentInput, Submission, UpdateAssignmentInput } from "./types";

/**
 * Assignments, submissions, and the sync that keeps student tasks in step.
 *
 * The interesting function here is `syncProjection`; everything else is
 * ordinary persistence.
 */

/* ── Assignments ───────────────────────────────────────────────────────── */

export async function createAssignment(
  organizationId: string,
  courseSectionId: string,
  createdBy: string,
  input: CreateAssignmentInput
): Promise<Assignment> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO assignments
         (id, organization_id, course_section_id, created_by, title, instructions,
          points, available_from, due_at, closes_at, submission_type, max_attempts,
          late_policy, estimated_mins, kind, due_timezone, rubric_id, rubric_scores)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, organizationId, courseSectionId, createdBy, input.title, input.instructions,
      input.points, input.availableFrom, input.dueAt, input.closesAt,
      input.submissionType, input.maxAttempts, input.latePolicy, input.estimatedMins,
      input.kind, input.dueTimezone, input.rubricId, input.rubricScores
    );
  const created = await getAssignment(id);
  if (!created) throw new Error("Assignment was created but could not be read back.");
  return created;
}

const ASSIGNMENT_COLUMNS = `id, organization_id, course_section_id, created_by, title,
       instructions, points, available_from, due_at, closes_at, submission_type, kind,
       max_attempts, late_policy, status, published_at, estimated_mins, due_timezone,
       rubric_id, rubric_scores`;

export async function getAssignment(id: string): Promise<Assignment | null> {
  const r = await db
    .prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE id = ?`)
    .get(id);
  return r ? mapAssignment(r) : null;
}

export async function listAssignments(courseSectionId: string): Promise<Assignment[]> {
  const rows = await db
    .prepare(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM assignments
        WHERE course_section_id = ?
        ORDER BY COALESCE(due_at, created_at) DESC`
    )
    .all(courseSectionId);
  return rows.map(mapAssignment);
}

/** What a student is allowed to see: published work only. */
export async function listPublishedAssignments(
  courseSectionId: string
): Promise<Assignment[]> {
  const rows = await db
    .prepare(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM assignments
        WHERE course_section_id = ? AND status = 'published'
        ORDER BY COALESCE(due_at, created_at) DESC`
    )
    .all(courseSectionId);
  return rows.map(mapAssignment);
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput
): Promise<Assignment> {
  await db
    .prepare(
      `UPDATE assignments
          SET title = ?, instructions = ?, points = ?, available_from = ?, due_at = ?,
              closes_at = ?, submission_type = ?, max_attempts = ?, late_policy = ?,
              estimated_mins = ?, updated_at = now()
        WHERE id = ?`
    )
    .run(
      input.title, input.instructions, input.points, input.availableFrom, input.dueAt,
      input.closesAt, input.submissionType, input.maxAttempts, input.latePolicy,
      input.estimatedMins, id
    );

  // A published assignment whose deadline just moved must move on every
  // student's task too, so the sync runs on every edit rather than only on
  // publish.
  await syncProjection(id);

  const updated = await getAssignment(id);
  if (!updated) throw new Error("Assignment disappeared during update.");
  return updated;
}

/** Publishing is the act that makes work exist for students. */
export async function publishAssignment(id: string): Promise<Assignment> {
  await db
    .prepare(
      `UPDATE assignments
          SET status = 'published',
              published_at = COALESCE(published_at, now()),
              updated_at = now()
        WHERE id = ?`
    )
    .run(id);
  await syncProjection(id);
  const out = await getAssignment(id);
  if (!out) throw new Error("Assignment disappeared during publish.");
  return out;
}

/** Withdrawing work archives the students' tasks rather than deleting them. */
export async function unpublishAssignment(id: string): Promise<Assignment> {
  await db
    .prepare(`UPDATE assignments SET status = 'draft', updated_at = now() WHERE id = ?`)
    .run(id);
  await syncProjection(id);
  const out = await getAssignment(id);
  if (!out) throw new Error("Assignment disappeared during unpublish.");
  return out;
}

function mapAssignment(r: any): Assignment {
  return {
    id: r.id,
    organizationId: r.organization_id,
    courseSectionId: r.course_section_id,
    createdBy: r.created_by ?? null,
    title: r.title,
    instructions: r.instructions ?? "",
    points: numeric(r.points),
    availableFrom: iso(r.available_from),
    dueAt: iso(r.due_at),
    closesAt: iso(r.closes_at),
    submissionType: r.submission_type,
    kind: r.kind ?? "task",
    maxAttempts: r.max_attempts ?? null,
    latePolicy: r.late_policy,
    status: r.status,
    publishedAt: iso(r.published_at),
    estimatedMins: r.estimated_mins ?? null,
    dueTimezone: r.due_timezone ?? null,
    rubricId: r.rubric_id ?? null,
    rubricScores: r.rubric_scores !== false,
  };
}

/* ── The projection ────────────────────────────────────────────────────── */

/**
 * Bring every enrolled student's Scholar task in step with this assignment.
 *
 * Called after any change a student should see. The writes run in one
 * transaction so a class of thirty either all get the update or none do — a
 * half-synced cohort where some students still see last week's deadline is
 * worse than a failure somebody notices.
 *
 * Students who enrol after publication are picked up automatically, because
 * the roster is read fresh on every sync rather than captured once at publish
 * time.
 */
export async function syncProjection(assignmentId: string): Promise<{ projected: number }> {
  const source = await db
    .prepare(
      `SELECT a.id, a.title, a.instructions, a.due_at, a.status, a.estimated_mins,
              c.code AS course_code, c.title AS course_title
         FROM assignments a
         JOIN course_sections cs ON cs.id = a.course_section_id
         JOIN courses c ON c.id = cs.course_id
        WHERE a.id = ?`
    )
    .get(assignmentId);

  if (!source) return { projected: 0 };

  const assignment: ProjectableAssignment = {
    id: source.id,
    title: source.title,
    instructions: source.instructions ?? "",
    dueAt: iso(source.due_at),
    status: source.status,
    estimatedMins: source.estimated_mins ?? null,
    courseCode: source.course_code,
    courseTitle: source.course_title,
  };

  // Drafted or withdrawn work: archive the tasks and stop.
  if (!shouldProject(assignment)) {
    const now = nowISO();
    await db.prepare(ARCHIVE_TASK_SQL).run(now, now, assignment.id);
    return { projected: 0 };
  }

  const enrolled = (await db
    .prepare(
      `SELECT e.user_id
         FROM enrollments e
         JOIN assignments a ON a.course_section_id = e.course_section_id
        WHERE a.id = ? AND e.status = 'active'`
    )
    .all(assignmentId)) as { user_id: string }[];

  const fields = projectedFields(assignment);

  await db.transaction(async () => {
    for (const { user_id: studentId } of enrolled) {
      // Subjects are per-user and personal, so this reuses whatever the
      // student already calls this course and creates one otherwise. It is
      // written on insert only, so a student who recategorised keeps it.
      const subject = await ensureSubject(studentId, fields.subject);
      const now = nowISO();
      await db
        .prepare(UPSERT_TASK_SQL)
        .run(
          newId(), studentId, fields.title, fields.details, fields.dueAt,
          subject.id, fields.estimateMins, assignment.id, now, now
        );
    }
  })();

  return { projected: enrolled.length };
}

/* ── Submissions ───────────────────────────────────────────────────────── */

const SUBMISSION_COLUMNS = `id, organization_id, assignment_id, user_id, attempt, status,
       body, url, submitted_at, is_late, score, feedback, graded_at, graded_by`;

export async function upsertSubmission(
  organizationId: string,
  assignmentId: string,
  userId: string,
  input: { body: string; url: string | null; attempt: number; isLate: boolean }
): Promise<Submission> {
  await db
    .prepare(
      `INSERT INTO assignment_submissions
         (id, organization_id, assignment_id, user_id, attempt, status, body, url,
          submitted_at, is_late)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, now(), ?)
       ON CONFLICT (assignment_id, user_id, attempt)
       DO UPDATE SET body = EXCLUDED.body,
                     url = EXCLUDED.url,
                     submitted_at = now(),
                     is_late = EXCLUDED.is_late,
                     status = 'submitted'`
    )
    .run(
      newId(), organizationId, assignmentId, userId, input.attempt,
      input.body, input.url, input.isLate
    );

  const r = await db
    .prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM assignment_submissions
        WHERE assignment_id = ? AND user_id = ? AND attempt = ?`
    )
    .get(assignmentId, userId, input.attempt);
  return mapSubmission(r);
}

export async function listSubmissions(assignmentId: string): Promise<Submission[]> {
  const rows = await db
    .prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM assignment_submissions
        WHERE assignment_id = ? ORDER BY user_id, attempt`
    )
    .all(assignmentId);
  return rows.map(mapSubmission);
}

/** One student's own work on one assignment. */
export async function listOwnSubmissions(
  assignmentId: string,
  userId: string
): Promise<Submission[]> {
  const rows = await db
    .prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM assignment_submissions
        WHERE assignment_id = ? AND user_id = ? ORDER BY attempt`
    )
    .all(assignmentId, userId);
  return rows.map(mapSubmission);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const r = await db
    .prepare(`SELECT ${SUBMISSION_COLUMNS} FROM assignment_submissions WHERE id = ?`)
    .get(id);
  return r ? mapSubmission(r) : null;
}

/**
 * Record a grade.
 *
 * `gradedBy` is required and is always a person's id. An AI may draft a score
 * and feedback, but the row is only written once a human has approved it: the
 * rule that AI never silently finalises a grade is enforced by there being no
 * code path here that writes a score without a teacher attached to it.
 */
export async function gradeSubmission(
  id: string,
  gradedBy: string,
  score: number | null,
  feedback: string,
  /** The model that drafted this mark, when one did. Null means unaided. */
  aiModel: string | null = null
): Promise<Submission> {
  const before = await getSubmission(id);
  if (!before) throw new Error("That submission no longer exists.");

  await db
    .prepare(
      `UPDATE assignment_submissions
          SET score = ?, feedback = ?, graded_at = now(), graded_by = ?, status = 'returned'
        WHERE id = ?`
    )
    .run(score, feedback, gradedBy, id);

  // Written after the change, in the same request, with the grader attached.
  // A mark that changed with no record of who changed it is the thing an
  // appeal cannot answer, so this is not optional and not conditional.
  await recordGradeEvent({
    organizationId: before.organizationId,
    submissionId: id,
    actorUserId: gradedBy,
    action:
      before.gradedAt === null ? "graded" : score === null ? "cleared" : "regraded",
    previousScore: before.score,
    newScore: score,
    previousFeedback: before.feedback || null,
    newFeedback: feedback || null,
    aiModel,
  });

  const out = await getSubmission(id);
  if (!out) throw new Error("Submission disappeared during grading.");
  return out;
}

function mapSubmission(r: any): Submission {
  return {
    id: r.id,
    organizationId: r.organization_id,
    assignmentId: r.assignment_id,
    userId: r.user_id,
    attempt: r.attempt,
    status: r.status,
    body: r.body ?? "",
    url: r.url ?? null,
    submittedAt: iso(r.submitted_at),
    isLate: Boolean(r.is_late),
    score: numeric(r.score),
    feedback: r.feedback ?? "",
    gradedAt: iso(r.graded_at),
    gradedBy: r.graded_by ?? null,
  };
}

/* ── Scope resolution ──────────────────────────────────────────────────── */

/**
 * Where does this thing actually live?
 *
 * Route handlers build a Scope with these rather than from the request, so
 * naming another institution's assignment id resolves to *their* organization
 * and the permission check refuses it. Trusting an organizationId from the
 * client would make every one of these checks decorative.
 */
export type ResourceScope = {
  organizationId: string;
  courseSectionId: string;
  courseId: string;
};

export async function scopeOfAssignment(id: string): Promise<ResourceScope | null> {
  const r = await db
    .prepare(
      `SELECT a.organization_id, a.course_section_id, cs.course_id
         FROM assignments a
         JOIN course_sections cs ON cs.id = a.course_section_id
        WHERE a.id = ?`
    )
    .get(id);
  return r
    ? {
        organizationId: r.organization_id,
        courseSectionId: r.course_section_id,
        courseId: r.course_id,
      }
    : null;
}

export async function scopeOfSection(id: string): Promise<ResourceScope | null> {
  const r = await db
    .prepare(`SELECT organization_id, id, course_id FROM course_sections WHERE id = ?`)
    .get(id);
  return r
    ? { organizationId: r.organization_id, courseSectionId: r.id, courseId: r.course_id }
    : null;
}

export async function scopeOfSubmission(
  id: string
): Promise<(ResourceScope & { studentUserId: string }) | null> {
  const r = await db
    .prepare(
      `SELECT s.organization_id, s.user_id, a.course_section_id, cs.course_id
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN course_sections cs ON cs.id = a.course_section_id
        WHERE s.id = ?`
    )
    .get(id);
  return r
    ? {
        organizationId: r.organization_id,
        courseSectionId: r.course_section_id,
        courseId: r.course_id,
        studentUserId: r.user_id,
      }
    : null;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** numeric columns come back as strings from node-postgres to avoid float loss. */
function numeric(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/* ── The marking queue ─────────────────────────────────────────────────── */

export type PendingSubmission = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  courseCode: string;
  sectionName: string;
  sectionId: string;
  studentUserId: string;
  attempt: number;
  submittedAt: string | null;
  isLate: boolean;
  points: number | null;
  body: string;
  url: string | null;
};

/**
 * Everything waiting on this teacher, across every section they teach.
 *
 * The single most useful question a teacher can ask the system, and it spans
 * sections — which is why it cannot live on a section page. Ordered oldest
 * first, because the work someone has been waiting longest for is the work
 * that should be marked next.
 */
export async function listPendingMarking(userId: string): Promise<PendingSubmission[]> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.assignment_id, s.user_id, s.attempt, s.submitted_at, s.is_late,
              s.body, s.url,
              a.title AS assignment_title, a.points,
              c.code AS course_code, cs.name AS section_name, cs.id AS section_id
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN course_sections cs ON cs.id = a.course_section_id
         JOIN courses c ON c.id = cs.course_id
         JOIN section_teachers st ON st.course_section_id = cs.id
        WHERE st.user_id = ? AND s.status = 'submitted'
        ORDER BY s.submitted_at NULLS LAST`
    )
    .all(userId);

  return rows.map((r: any) => ({
    id: r.id,
    assignmentId: r.assignment_id,
    assignmentTitle: r.assignment_title,
    courseCode: r.course_code,
    sectionName: r.section_name,
    sectionId: r.section_id,
    studentUserId: r.user_id,
    attempt: r.attempt,
    submittedAt: iso(r.submitted_at),
    isLate: Boolean(r.is_late),
    points: numeric(r.points),
    body: r.body ?? "",
    url: r.url ?? null,
  }));
}
