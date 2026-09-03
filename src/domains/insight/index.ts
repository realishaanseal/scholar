import { db } from "@/lib/db";
import { getAvailability, paceBySubject } from "@/lib/scholar/memory";
import { calibrateEstimate, deadlineCollisions, planStart } from "./plan";
import type { CollisionWarning, WorkPlan } from "./plan";

export * from "./plan";

/**
 * Where the institution's data meets what Scholar knows about the student.
 *
 * The Phase 0 audit's test for scope creep was to prefer anything
 * strengthening the institution → intelligence link over LMS feature parity.
 * This module is that link: everything here reads institutional rows and
 * answers a question only the personal layer can answer.
 *
 * The direction of the dependency matters. Insight reads from the
 * institutional side and never writes to it — an assignment's deadline is not
 * something Scholar gets to move because it decided the week was busy. It can
 * say so, to the student and to the teacher, and that is all.
 */

/**
 * Plan one student's outstanding coursework.
 *
 * Loads the student's pace and availability once and applies them across
 * every assignment, rather than per item: a term's worth of work would
 * otherwise mean a query per row to answer a question about the same person.
 */
export async function planCoursework(
  userId: string,
  sectionId: string,
  now: Date = new Date()
): Promise<WorkPlan[]> {
  const [rows, pace, profile] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.title, a.due_at, a.estimated_mins, c.title AS subject
           FROM assignments a
           JOIN course_sections cs ON cs.id = a.course_section_id
           JOIN courses c ON c.id = cs.course_id
          WHERE a.course_section_id = ?
            AND a.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM assignment_submissions s
               WHERE s.assignment_id = a.id AND s.user_id = ?
            )
          ORDER BY a.due_at NULLS LAST`
      )
      .all(sectionId, userId),
    paceBySubject(userId),
    getAvailability(userId),
  ]);

  return (rows as any[]).map((r) => {
    const teacherMins =
      r.estimated_mins === null || r.estimated_mins === undefined
        ? null
        : Number(r.estimated_mins);

    const { mins, adjusted, reason } = calibrateEstimate(teacherMins, pace[r.subject]);

    const dueAt = r.due_at instanceof Date ? r.due_at : r.due_at ? new Date(r.due_at) : null;

    return {
      assignmentId: r.id,
      title: String(r.title ?? ""),
      dueAt: dueAt ? dueAt.toISOString() : null,
      teacherMins,
      expectedMins: mins,
      adjusted,
      reason,
      plan: planStart(dueAt, mins, profile, now),
    };
  });
}

/**
 * What is already due on a given day for one class.
 *
 * Asked by the teacher's editor before a deadline is set, so the warning
 * arrives while the date can still be changed painlessly. Counts published
 * work only: a draft is not yet a demand on anyone's evening.
 */
export async function sectionDeadlineLoad(
  sectionId: string,
  excludeAssignmentId: string | null = null
): Promise<{ day: string; existing: number; estimatedMins: number }[]> {
  const rows = await db
    .prepare(
      `SELECT to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS existing,
              COALESCE(SUM(estimated_mins), 0)::int AS estimated_mins
         FROM assignments
        WHERE course_section_id = ?
          AND status = 'published'
          AND due_at IS NOT NULL
          -- Cast required: a parameter whose only use is IS NULL gives
          -- Postgres nothing to infer a type from, and it refuses to guess.
          AND (?::text IS NULL OR id <> ?)
        GROUP BY 1`
    )
    .all(sectionId, excludeAssignmentId, excludeAssignmentId);

  return (rows as any[]).map((r) => ({
    day: String(r.day),
    existing: Number(r.existing),
    estimatedMins: Number(r.estimated_mins),
  }));
}

/** The warning for one proposed deadline, or null when the day is clear. */
export async function checkDeadline(
  sectionId: string,
  proposedDay: string,
  proposedMins: number | null,
  excludeAssignmentId: string | null = null
): Promise<CollisionWarning | null> {
  const load = await sectionDeadlineLoad(sectionId, excludeAssignmentId);
  return deadlineCollisions(load, proposedDay, proposedMins);
}
