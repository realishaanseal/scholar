import { COURSE_BOUND, ROLE_PERMISSIONS } from "./permissions";
import type { Actor, Membership, Permission, RoleId, Scope } from "./types";

/**
 * The single authorization primitive.
 *
 * Everything institutional goes through `can()`. It fails closed at every
 * branch: an unknown role, a missing organization, a course-bound permission
 * with nothing to bind to, or a scope the actor has no relationship with all
 * return false rather than falling through to a permissive default.
 *
 * Deliberately synchronous and pure. The database work — resolving an Actor —
 * happens once per request; the checks themselves are then free, so guarding
 * every branch of a handler costs nothing and there is no incentive to skip one.
 */

export type Decision = {
  allowed: boolean;
  /** Why, in terms an audit log or a developer can use. Never shown to end users. */
  reason: string;
};

/** The permission check. Scope is required by the signature, not by convention. */
export function can(actor: Actor, permission: Permission, scope: Scope): boolean {
  return explain(actor, permission, scope).allowed;
}

/** As `can()`, but returns the reasoning — for audit records and debugging. */
export function explain(actor: Actor, permission: Permission, scope: Scope): Decision {
  if (actor.superAdmin) {
    return { allowed: true, reason: "super admin" };
  }

  if (!scope.organizationId) {
    // No institutional permission means anything outside an institution. An
    // unscoped check is a caller bug, and guessing an organization would be
    // the worst possible way to resolve it.
    return { allowed: false, reason: "no organization in scope" };
  }

  const inOrg = actor.memberships.filter((m) => m.organizationId === scope.organizationId);
  if (inOrg.length === 0) {
    return { allowed: false, reason: "not a member of this organization" };
  }

  // A user may hold several roles in one organization (a PhD student who also
  // teaches). Any one of them granting the permission is enough, so the most
  // permissive matching role wins — but each is still scope-checked on its own
  // terms, so teaching rights never leak across sections.
  for (const membership of inOrg) {
    const granted = ROLE_PERMISSIONS[membership.role];
    if (!granted || !granted.includes(permission)) continue;

    const bound = isBound(actor, membership, permission, scope);
    if (bound.allowed) {
      return { allowed: true, reason: `${membership.role}: ${bound.reason}` };
    }
  }

  return { allowed: false, reason: "no role in this organization grants it in this scope" };
}

/**
 * Does this membership actually reach the thing being acted on?
 *
 * Holding a permission is about capability; this is about reach. The split is
 * what stops "teacher" from meaning "teacher of everything".
 */
function isBound(
  actor: Actor,
  membership: Membership,
  permission: Permission,
  scope: Scope
): Decision {
  const orgId = membership.organizationId;
  const needsCourse = COURSE_BOUND.has(permission);

  switch (membership.role) {
    case "INSTITUTION_ADMIN":
      // Authority over the whole organization; no narrower binding needed.
      return { allowed: true, reason: "organization-wide" };

    case "DEPARTMENT_ADMIN": {
      if (!membership.departmentId) {
        return { allowed: false, reason: "department admin with no department" };
      }
      // Fails closed on purpose: resolving a course to its department needs a
      // lookup this pure function does not do, so the caller must pass the
      // department it already knows. Guessing would be the unsafe option.
      if (scope.departmentId !== membership.departmentId) {
        return { allowed: false, reason: "outside their department" };
      }
      return { allowed: true, reason: "department-wide" };
    }

    case "TEACHER":
    case "TEACHING_ASSISTANT": {
      // Naming a student without naming where forces the caller to be
      // specific, so the section binding below can actually vet it. Without
      // this, an organization-scoped capability like student:view would let
      // any teacher look up any student in the institution.
      if (scope.studentUserId && !scope.courseSectionId && !scope.courseId) {
        return { allowed: false, reason: "naming a student requires a course or section" };
      }
      if (!needsCourse && !scope.studentUserId) {
        return { allowed: true, reason: "organization-scoped capability" };
      }
      const teaches = actor.teaching.some(
        (t) =>
          t.organizationId === orgId &&
          (scope.courseSectionId
            ? t.courseSectionId === scope.courseSectionId
            : scope.courseId
              ? t.courseId === scope.courseId
              : false)
      );
      return teaches
        ? { allowed: true, reason: "teaches this section" }
        : { allowed: false, reason: "does not teach this section" };
    }

    case "STUDENT": {
      // Checked FIRST, before any early return. A student may act on their own
      // record and no one else's, and that holds for every permission — not
      // just the course-bound ones. Ordering this after the needsCourse
      // shortcut below let a student read another student's grades, since
      // grade:view is organization-scoped rather than course-bound.
      if (scope.studentUserId && scope.studentUserId !== actor.userId) {
        return { allowed: false, reason: "another student's record" };
      }
      if (!needsCourse) return { allowed: true, reason: "organization-scoped capability" };
      const enrolled = actor.enrollments.some(
        (e) =>
          e.organizationId === orgId &&
          (scope.courseSectionId
            ? e.courseSectionId === scope.courseSectionId
            : scope.courseId
              ? e.courseId === scope.courseId
              : false)
      );
      return enrolled
        ? { allowed: true, reason: "enrolled in this section" }
        : { allowed: false, reason: "not enrolled in this section" };
    }

    case "PARENT": {
      // A guardian's reach is defined entirely by which child is named, so a
      // check that names no child is refused rather than treated as org-wide.
      if (!scope.studentUserId) {
        return { allowed: false, reason: "guardian access requires naming a student" };
      }
      const isGuardian = (actor.guardianOf ?? []).includes(scope.studentUserId);
      return isGuardian
        ? { allowed: true, reason: "guardian of this student" }
        : { allowed: false, reason: "not a guardian of this student" };
    }

    case "COUNSELOR":
      // Pastoral reach is organization-wide but read-only, which is expressed
      // by the permissions the role holds rather than by a check here.
      return { allowed: true, reason: "organization-wide pastoral role" };

    case "SUPER_ADMIN":
      return { allowed: true, reason: "super admin" };

    default: {
      // An unrecognised role is a denial, never a pass. The exhaustiveness
      // check makes adding a RoleId without a binding rule a compile error.
      const _exhaustive: never = membership.role;
      void _exhaustive;
      return { allowed: false, reason: "unknown role" };
    }
  }
}

/** Thrown by `authorize()`; the API layer maps it to a 403. */
export class Forbidden extends Error {
  constructor(
    readonly permission: Permission,
    readonly scope: Scope,
    readonly why: string
  ) {
    super(`Not permitted: ${permission}`);
    this.name = "Forbidden";
  }
}

/**
 * Assert a permission, throwing if absent.
 *
 * Preferred over `if (!can(...)) return 403` in handlers: a forgotten return
 * silently continues, whereas a forgotten throw cannot. The message given to
 * the client stays generic; `why` is for the log.
 */
export function authorize(actor: Actor, permission: Permission, scope: Scope): void {
  const decision = explain(actor, permission, scope);
  if (!decision.allowed) throw new Forbidden(permission, scope, decision.reason);
}

/** Roles the actor holds in one organization. Useful for shaping navigation. */
export function rolesIn(actor: Actor, organizationId: string): RoleId[] {
  return actor.memberships
    .filter((m) => m.organizationId === organizationId)
    .map((m) => m.role);
}
