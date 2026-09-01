/**
 * The vocabulary of institutional authorization.
 *
 * Two rules shape everything here.
 *
 * 1. A ROLE IS NEVER GLOBAL. "Teacher" is not a property of a person, it is a
 *    relationship between a person and a section. Every permission check
 *    therefore takes a scope, and a role that grants a permission still has
 *    to be bound to the thing being acted on. This is why `can()` cannot be
 *    called without a scope argument — omitting it must be impossible rather
 *    than merely discouraged.
 *
 * 2. PERSONAL DATA IS NOT IN THIS SYSTEM AT ALL. There is deliberately no
 *    permission for a student's own tasks, study sessions, notes or AI
 *    conversations, because the safest way to guarantee no institutional role
 *    can ever reach them is for no grantable permission to exist. Sharing
 *    personal data stays where it already is: student-granted, scoped, and
 *    revocable (see lib/sharing/model.ts). An institution is not a party to
 *    it.
 */

/** Institutional capabilities. Personal-layer access is intentionally absent. */
export type Permission =
  // Organization administration
  | "organization:manage"
  | "member:manage"
  | "role:manage"
  // Academic structure
  | "department:manage"
  | "course:create"
  | "course:update"
  | "course:delete"
  | "course:view"
  | "enrollment:manage"
  // Coursework
  | "assignment:create"
  | "assignment:update"
  | "assignment:delete"
  | "assignment:view"
  | "assignment:grade"
  | "submission:create"
  | "submission:view"
  // Grades
  | "grade:view"
  | "grade:modify"
  | "grade:publish"
  // Attendance
  | "attendance:view"
  | "attendance:manage"
  // People and insight
  | "student:view"
  | "student:message"
  | "analytics:view"
  // Communication
  | "announcement:create"
  | "discussion:post"
  | "discussion:moderate";

export type RoleId =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "TEACHER"
  | "TEACHING_ASSISTANT"
  | "STUDENT"
  | "PARENT"
  | "COUNSELOR";

/**
 * What is being acted upon.
 *
 * Every field is optional because different permissions are answerable at
 * different depths, but `organizationId` is required in practice: a check
 * without one is denied, since no institutional permission is meaningful
 * outside an institution.
 */
export type Scope = {
  organizationId?: string;
  departmentId?: string;
  courseId?: string;
  courseSectionId?: string;
  /** For permissions about a specific person, e.g. a parent viewing a child. */
  studentUserId?: string;
};

export type Membership = {
  organizationId: string;
  role: RoleId;
  /** Set for DEPARTMENT_ADMIN; the department they administer. */
  departmentId?: string;
};

/** A section the actor teaches. Carries courseId so course-level checks resolve. */
export type TeachingAssignment = {
  organizationId: string;
  courseId: string;
  courseSectionId: string;
};

export type EnrollmentRef = {
  organizationId: string;
  courseId: string;
  courseSectionId: string;
};

/**
 * Everything a permission decision needs, resolved once per request rather
 * than re-queried per check.
 *
 * Roles are resolved server-side into this object on each request and are
 * deliberately NOT carried in the session token: a revoked role then takes
 * effect on the next request instead of whenever the token happens to expire.
 */
export type Actor = {
  userId: string;
  /** Platform operator. Bypasses org binding; expected to be vanishingly rare. */
  superAdmin?: boolean;
  memberships: Membership[];
  teaching: TeachingAssignment[];
  enrollments: EnrollmentRef[];
  /** Student user ids this actor is a guardian of. Only meaningful for PARENT. */
  guardianOf?: string[];
};

/** An actor with no institutional standing whatsoever — the independent user. */
export function personalActor(userId: string): Actor {
  return { userId, memberships: [], teaching: [], enrollments: [] };
}
