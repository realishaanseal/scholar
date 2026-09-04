import { db, newId } from "@/lib/db";
import { audit } from "@/lib/governance";
import { attendanceFor } from "@/domains/attendance";

/**
 * What a parent may see, and what they may not.
 *
 * The narrow view is the design, not a limitation to be relaxed later. A
 * guardian sees what the school has decided to tell them about their child's
 * schooling: what was set, what was handed in, marks that have been released,
 * and attendance. That is the same information a paper report has carried for
 * a century, and it is enough to have the conversation a parent wants to have.
 *
 * What they do not see is the personal layer — effort estimates, study
 * patterns, focus sessions, when their child worked and for how long. Scholar
 * knows all of it and none of it is a school's to hand on. A parent is not an
 * administrator of their child, and the fact that both are adults asking
 * about the same student does not make them the same request.
 *
 * That distinction is enforced by which tables this file is willing to name,
 * which is the same technique used to keep the AI context away from personal
 * data. There is no filter to get wrong.
 */

export type GuardianLink = {
  id: string;
  guardianUserId: string;
  studentUserId: string;
  studentName: string | null;
  guardianName: string | null;
  relationship: string;
  addedByLabel: string;
  createdAt: string;
};

/**
 * Assert that this adult is a guardian of this child.
 *
 * Only ever called by a member of staff. There is deliberately no path where
 * somebody claims this about themselves: proving control of an email address
 * is not the same as being a child's guardian, and the school is the only
 * party in this system positioned to know.
 */
export async function linkGuardian(input: {
  organizationId: string;
  guardianUserId: string;
  studentUserId: string;
  relationship: string;
  addedBy: string;
}): Promise<GuardianLink> {
  if (input.guardianUserId === input.studentUserId) {
    throw new Error("Somebody cannot be their own guardian.");
  }

  const staff = await db
    .prepare(`SELECT COALESCE(name, email, '') AS label FROM users WHERE id = ?`)
    .get(input.addedBy);

  await db
    .prepare(
      `INSERT INTO guardian_links
         (id, organization_id, guardian_user_id, student_user_id, relationship,
          added_by, added_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (organization_id, guardian_user_id, student_user_id)
       DO UPDATE SET revoked_at = NULL, revoked_by = NULL,
                     relationship = excluded.relationship,
                     added_by = excluded.added_by,
                     added_by_label = excluded.added_by_label`
    )
    .run(
      newId(), input.organizationId, input.guardianUserId, input.studentUserId,
      input.relationship, input.addedBy, String((staff as any)?.label ?? "")
    );

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.addedBy,
    action: "member:add",
    subjectType: "guardian:link",
    subjectId: input.studentUserId,
    detail: { guardian: input.guardianUserId, relationship: input.relationship },
  });

  const link = await getLink(input.organizationId, input.guardianUserId, input.studentUserId);
  if (!link) throw new Error("The link could not be created.");
  return link;
}

/**
 * End a guardian's access.
 *
 * Revoked rather than deleted. Family arrangements change, sometimes because
 * a court has decided they should, and a school has to be able to say when
 * access ended and who ended it. A deleted row cannot answer that question.
 */
export async function revokeGuardian(input: {
  organizationId: string;
  guardianUserId: string;
  studentUserId: string;
  revokedBy: string;
}): Promise<void> {
  await db
    .prepare(
      `UPDATE guardian_links
          SET revoked_at = now(), revoked_by = ?
        WHERE organization_id = ? AND guardian_user_id = ? AND student_user_id = ?
          AND revoked_at IS NULL`
    )
    .run(input.revokedBy, input.organizationId, input.guardianUserId, input.studentUserId);

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.revokedBy,
    action: "member:suspend",
    subjectType: "guardian:revoke",
    subjectId: input.studentUserId,
    detail: { guardian: input.guardianUserId },
  });
}

const LINK_SELECT = `
  SELECT g.id, g.guardian_user_id, g.student_user_id, g.relationship,
         g.added_by_label, g.created_at,
         s.name AS student_name, p.name AS guardian_name
    FROM guardian_links g
    JOIN users s ON s.id = g.student_user_id
    JOIN users p ON p.id = g.guardian_user_id`;

function map(r: any): GuardianLink {
  return {
    id: r.id,
    guardianUserId: r.guardian_user_id,
    studentUserId: r.student_user_id,
    studentName: r.student_name ?? null,
    guardianName: r.guardian_name ?? null,
    relationship: r.relationship ?? "",
    addedByLabel: r.added_by_label ?? "",
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getLink(
  organizationId: string,
  guardianUserId: string,
  studentUserId: string
): Promise<GuardianLink | null> {
  const r = await db
    .prepare(
      `${LINK_SELECT}
        WHERE g.organization_id = ? AND g.guardian_user_id = ?
          AND g.student_user_id = ? AND g.revoked_at IS NULL`
    )
    .get(organizationId, guardianUserId, studentUserId);
  return r ? map(r) : null;
}

export type Ward = {
  studentUserId: string;
  studentName: string | null;
  organizationId: string;
  organizationName: string;
  relationship: string;
};

/**
 * The children this adult may read about, with enough to render a list.
 *
 * Separate from childrenOf, which returns bare ids and exists to populate
 * Actor.guardianOf during authorization. That one is deliberately narrow —
 * a permission check has no business loading names — so this is the read a
 * screen uses, and the two do not share a shape.
 */
export async function wardsOf(guardianUserId: string): Promise<Ward[]> {
  const rows = await db
    .prepare(
      `SELECT g.student_user_id, g.organization_id, g.relationship,
              u.name AS student_name, o.name AS organization_name
         FROM guardian_links g
         JOIN users u ON u.id = g.student_user_id
         JOIN organizations o ON o.id = g.organization_id
        WHERE g.guardian_user_id = ? AND g.revoked_at IS NULL
        ORDER BY u.name NULLS LAST, g.student_user_id`
    )
    .all(guardianUserId);

  return (rows as any[]).map((r) => ({
    studentUserId: r.student_user_id,
    studentName: r.student_name ?? null,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    relationship: r.relationship ?? "",
  }));
}

/** The children this adult may read about. Drives Actor.guardianOf. */
export async function childrenOf(guardianUserId: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT student_user_id FROM guardian_links
        WHERE guardian_user_id = ? AND revoked_at IS NULL`
    )
    .all(guardianUserId);
  return (rows as any[]).map((r) => r.student_user_id);
}

/**
 * Who can read about this student.
 *
 * Readable by the student themselves. Somebody is entitled to know who is
 * receiving reports about them, and a system that hides that from a
 * seventeen-year-old is one that has decided their privacy belongs to
 * somebody else.
 */
export async function guardiansOf(studentUserId: string): Promise<GuardianLink[]> {
  const rows = await db
    .prepare(
      `${LINK_SELECT} WHERE g.student_user_id = ? AND g.revoked_at IS NULL
        ORDER BY g.created_at`
    )
    .all(studentUserId);
  return (rows as any[]).map(map);
}

/* ── What a guardian actually sees ─────────────────────────────────────── */

export type GuardianDigest = {
  studentName: string | null;
  courses: Array<{
    sectionId: string;
    courseCode: string;
    courseTitle: string;
    /** Work set and not yet handed in, with its deadline. */
    outstanding: Array<{ title: string; dueAt: string | null }>;
    /** Marks the teacher has actually released. */
    recent: Array<{ title: string; score: number | null; points: number | null }>;
  }>;
  attendance: { present: number; absent: number; late: number; excused: number; rate: number | null };
};

/**
 * The digest.
 *
 * Google's model rather than a portal: a weekly summary somebody reads beats
 * a login they abandon. This assembles what such a summary contains, and the
 * shape of it is the enforcement — there is no field here for anything from
 * the personal layer, so no screen built on it can accidentally show one.
 *
 * Released marks only. A guardian must not see a mark before the student
 * does; finding out your grade because your mother mentioned it over dinner
 * is a specific and avoidable indignity.
 */
export async function digestFor(
  studentUserId: string,
  organizationId: string,
  from: string,
  to: string
): Promise<GuardianDigest> {
  const student = await db
    .prepare(`SELECT name FROM users WHERE id = ?`)
    .get(studentUserId);

  const rows = await db
    .prepare(
      `SELECT cs.id AS section_id, c.code, c.title,
              a.id AS assignment_id, a.title AS assignment_title, a.due_at, a.points,
              sub.score, sub.posted_at, sub.submitted_at
         FROM enrollments e
         JOIN course_sections cs ON cs.id = e.course_section_id
         JOIN courses c ON c.id = cs.course_id
         JOIN assignments a
           ON a.course_section_id = cs.id AND a.status = 'published'
         LEFT JOIN LATERAL (
           SELECT score, posted_at, submitted_at
             FROM assignment_submissions x
            WHERE x.assignment_id = a.id AND x.user_id = e.user_id
            ORDER BY x.attempt DESC LIMIT 1
         ) sub ON true
        WHERE e.user_id = ? AND e.status = 'active'
          AND cs.organization_id = ?
          -- Work this child was actually set.
          AND (
            NOT EXISTS (SELECT 1 FROM assignment_assignees x WHERE x.assignment_id = a.id)
            OR EXISTS (
              SELECT 1 FROM assignment_assignees x
               WHERE x.assignment_id = a.id AND x.user_id = e.user_id
            )
          )
        ORDER BY c.code, a.due_at NULLS LAST`
    )
    .all(studentUserId, organizationId);

  const byCourse = new Map<string, GuardianDigest["courses"][number]>();
  for (const r of rows as any[]) {
    if (!byCourse.has(r.section_id)) {
      byCourse.set(r.section_id, {
        sectionId: r.section_id,
        courseCode: r.code,
        courseTitle: r.title,
        outstanding: [],
        recent: [],
      });
    }
    const course = byCourse.get(r.section_id)!;

    const due = r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at ?? null;

    if (!r.submitted_at) {
      course.outstanding.push({ title: r.assignment_title, dueAt: due });
    } else if (r.posted_at) {
      // Released only. A guardian must not learn a mark before the student.
      course.recent.push({
        title: r.assignment_title,
        score: r.score === null || r.score === undefined ? null : Number(r.score),
        points: r.points === null || r.points === undefined ? null : Number(r.points),
      });
    }
  }

  const attendance = await attendanceFor(studentUserId, null, from, to);

  return {
    studentName: (student as any)?.name ?? null,
    courses: [...byCourse.values()],
    attendance: {
      present: attendance.present,
      absent: attendance.absent,
      late: attendance.late,
      excused: attendance.excused,
      rate: attendance.rate,
    },
  };
}
