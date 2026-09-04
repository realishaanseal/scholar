import { db, newId } from "@/lib/db";

/**
 * Setting work for some students rather than all of them.
 *
 * Extensions, resits, differentiated tasks, access arrangements. The rule
 * throughout is that no rows means everyone — the normal case costs nothing
 * to express, only the exception is written down, and every assignment that
 * already existed keeps working with no backfill.
 */

export type Assignee = { userId: string; reason: string };

/** Who this is set for. Empty means the whole section. */
export async function assigneesOf(assignmentId: string): Promise<Assignee[]> {
  const rows = await db
    .prepare(
      `SELECT user_id, reason FROM assignment_assignees
        WHERE assignment_id = ? ORDER BY created_at`
    )
    .all(assignmentId);
  return (rows as any[]).map((r) => ({ userId: r.user_id, reason: r.reason ?? "" }));
}

/**
 * Restrict an assignment to named students.
 *
 * Passing an empty list clears the restriction and gives it back to the whole
 * section, which is the same operation a teacher thinks of as "actually,
 * everyone" and should not require a different button.
 */
export async function setAssignees(
  organizationId: string,
  assignmentId: string,
  assignees: Assignee[]
): Promise<Assignee[]> {
  await db
    .prepare(`DELETE FROM assignment_assignees WHERE assignment_id = ?`)
    .run(assignmentId);

  for (const a of assignees) {
    await db
      .prepare(
        `INSERT INTO assignment_assignees
           (id, organization_id, assignment_id, user_id, reason)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (assignment_id, user_id) DO NOTHING`
      )
      .run(newId(), organizationId, assignmentId, a.userId, a.reason ?? "");
  }

  return assigneesOf(assignmentId);
}

/**
 * Is this assignment this student's to do?
 *
 * Used by the submission route, because a hidden assignment is a courtesy and
 * a refused POST is the rule — somebody who guesses an assignment id should
 * not be able to hand in work they were never set.
 */
export async function isSetFor(
  assignmentId: string,
  userId: string
): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT 1 AS present
        WHERE NOT EXISTS (
                SELECT 1 FROM assignment_assignees WHERE assignment_id = ?
              )
           OR EXISTS (
                SELECT 1 FROM assignment_assignees
                 WHERE assignment_id = ? AND user_id = ?
              )`
    )
    .get(assignmentId, assignmentId, userId);
  return Boolean(r);
}
