import type { Actor, Membership, RoleId } from "@/lib/authz";

/**
 * Building an Actor from database rows.
 *
 * Kept separate from the query that fetches them so the mapping — which is
 * where the security-relevant decisions live — is a pure function that can be
 * tested without a database.
 */

/** One row of the membership query, in the shape Postgres returns it. */
export type MembershipRow = {
  organization_id: string;
  role: string;
  department_id: string | null;
  status: string;
};

export type TeachingRow = {
  organization_id: string;
  course_id: string;
  course_section_id: string;
};

export type EnrollmentRow = TeachingRow;

const KNOWN_ROLES = new Set<string>([
  "SUPER_ADMIN",
  "INSTITUTION_ADMIN",
  "DEPARTMENT_ADMIN",
  "TEACHER",
  "TEACHING_ASSISTANT",
  "STUDENT",
  "PARENT",
  "COUNSELOR",
]);

/**
 * Turn rows into an Actor.
 *
 * Two filters matter more than they look:
 *
 *   - Only `active` memberships count. An invited-but-not-accepted or a
 *     suspended member has a row, and treating the row's existence as
 *     authority would grant access to someone who was explicitly stopped.
 *   - An unrecognised role is dropped rather than passed through. The role
 *     column has no CHECK constraint (so institutions can define their own
 *     later), which means the database can hold a string this build has no
 *     binding rules for. Passing it on would reach `isBound`'s default branch
 *     and be denied anyway — dropping it here makes that explicit instead of
 *     incidental.
 */
export function toActor(
  userId: string,
  rows: {
    memberships: MembershipRow[];
    teaching?: TeachingRow[];
    enrollments?: EnrollmentRow[];
    guardianOf?: string[];
    superAdmin?: boolean;
  }
): Actor {
  const memberships: Membership[] = rows.memberships
    .filter((r) => r.status === "active")
    .filter((r) => KNOWN_ROLES.has(r.role))
    .map((r) => ({
      organizationId: r.organization_id,
      role: r.role as RoleId,
      ...(r.department_id ? { departmentId: r.department_id } : {}),
    }));

  return {
    userId,
    superAdmin: rows.superAdmin ?? false,
    memberships,
    teaching: (rows.teaching ?? []).map((r) => ({
      organizationId: r.organization_id,
      courseId: r.course_id,
      courseSectionId: r.course_section_id,
    })),
    enrollments: (rows.enrollments ?? []).map((r) => ({
      organizationId: r.organization_id,
      courseId: r.course_id,
      courseSectionId: r.course_section_id,
    })),
    ...(rows.guardianOf?.length ? { guardianOf: rows.guardianOf } : {}),
  };
}
