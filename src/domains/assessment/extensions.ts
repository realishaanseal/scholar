import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Asking for more time, with the arithmetic attached.
 *
 * Scholar computes that a student has more work than hours. Showing them that
 * and stopping is the least useful place to stop: the student who needs an
 * extension is the one least likely to start the conversation, and the case
 * they would have to make is one Scholar has already worked out.
 *
 * So a request carries the two figures Scholar computed at the moment it was
 * sent. The teacher is deciding on evidence rather than on an assertion, and
 * the student did not have to argue.
 *
 * The figures are the student's own totals, which is the only personal-layer
 * number that crosses into an institutional object anywhere in this product.
 * It is defensible because the student chose to send it, about themselves, for
 * a decision they asked for — and because it is two integers rather than a
 * view. A teacher opening this sees how much work and how much time. Not the
 * study pattern behind it, not the other courses, not what else is late.
 */

export type ExtensionStatus = "pending" | "granted" | "declined" | "withdrawn";

export type ExtensionRequest = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentUserId: string;
  studentName: string | null;
  workMins: number;
  availableMins: number;
  message: string;
  status: ExtensionStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string;
};

const SELECT = `
  SELECT r.id, r.assignment_id, r.student_user_id, r.work_mins, r.available_mins,
         r.message, r.status, r.created_at, r.decided_at, r.decision_note,
         a.title AS assignment_title, u.name AS student_name
    FROM extension_requests r
    JOIN assignments a ON a.id = r.assignment_id
    JOIN users u ON u.id = r.student_user_id`;

function map(r: any): ExtensionRequest {
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    assignmentTitle: r.assignment_title,
    studentUserId: r.student_user_id,
    studentName: r.student_name ?? null,
    workMins: Number(r.work_mins ?? 0),
    availableMins: Number(r.available_mins ?? 0),
    message: r.message ?? "",
    status: r.status,
    createdAt: iso(r.created_at)!,
    decidedAt: iso(r.decided_at),
    decisionNote: r.decision_note ?? "",
  };
}

/**
 * Send one.
 *
 * Returns the existing request when there already is one open, rather than
 * failing. A student tapping twice has not done anything wrong, and the unique
 * index means the second insert would fail anyway — better to hand back what
 * they already sent than to show them an error for it.
 */
export async function requestExtension(input: {
  organizationId: string;
  assignmentId: string;
  studentUserId: string;
  workMins: number;
  availableMins: number;
  message?: string;
}): Promise<ExtensionRequest> {
  const open = await db
    .prepare(
      `${SELECT}
        WHERE r.assignment_id = ? AND r.student_user_id = ? AND r.status = 'pending'`
    )
    .get(input.assignmentId, input.studentUserId);
  if (open) return map(open);

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO extension_requests
         (id, organization_id, assignment_id, student_user_id,
          work_mins, available_mins, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.organizationId,
      input.assignmentId,
      input.studentUserId,
      Math.max(0, Math.round(input.workMins)),
      Math.max(0, Math.round(input.availableMins)),
      (input.message ?? "").slice(0, 1000)
    );

  const row = await db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
  return map(row);
}

/**
 * Everything still waiting on this teacher, across every class.
 *
 * Needs no permission check for the same reason the marking queue does not:
 * the join runs through section_teachers on the viewer's own id, so it cannot
 * return a request from a section they do not teach. Answering one still goes
 * through the API, which authorizes against the assignment properly.
 */
export async function pendingExtensions(
  teacherUserId: string
): Promise<ExtensionRequest[]> {
  const rows = await db
    .prepare(
      `${SELECT}
        JOIN course_sections cs ON cs.id = a.course_section_id
        JOIN section_teachers st ON st.course_section_id = cs.id
       WHERE st.user_id = ?
         AND r.status = 'pending'
       ORDER BY r.created_at`
    )
    .all(teacherUserId);
  return (rows as any[]).map(map);
}

/** What this student has asked for on one assignment, if anything. */
export async function extensionFor(
  assignmentId: string,
  studentUserId: string
): Promise<ExtensionRequest | null> {
  const r = await db
    .prepare(
      `${SELECT}
        WHERE r.assignment_id = ? AND r.student_user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 1`
    )
    .get(assignmentId, studentUserId);
  return r ? map(r) : null;
}

/**
 * Answer one.
 *
 * Granting does not move the deadline. Scholar has no way to know what the
 * teacher agreed to — a day, a week, until Monday — and a system that guessed
 * would be inventing a deadline nobody set. The teacher records the decision
 * here and changes the date, or the student's own copy of it, deliberately.
 */
export async function decideExtension(input: {
  id: string;
  organizationId: string;
  decidedBy: string;
  status: "granted" | "declined";
  note?: string;
}): Promise<void> {
  await db
    .prepare(
      `UPDATE extension_requests
          SET status = ?, decided_by = ?, decided_at = now(), decision_note = ?
        WHERE id = ? AND organization_id = ? AND status = 'pending'`
    )
    .run(
      input.status,
      input.decidedBy,
      (input.note ?? "").slice(0, 1000),
      input.id,
      input.organizationId
    );
}
