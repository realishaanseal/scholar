import type { Permission, RoleId } from "./types";

/**
 * Default role grants.
 *
 * This is a seed, not the law. The intent is that these rows live in a
 * `role_permissions` table so an institution can define its own roles without
 * a redeploy; until that table exists this constant is the single source, and
 * the shape is already the shape the table will hold (role, permission) so the
 * move is a data migration rather than a rewrite.
 *
 * Granting a permission here is necessary but never sufficient — scope binding
 * in policy.ts still has to pass. TEACHER holding `assignment:grade` means
 * "may grade in sections they teach", not "may grade".
 */
export const ROLE_PERMISSIONS: Record<RoleId, readonly Permission[]> = {
  // Platform operator. Listed for completeness; policy.ts short-circuits before
  // consulting this, since a super admin is not bound to any organization.
  SUPER_ADMIN: [],

  INSTITUTION_ADMIN: [
    "organization:manage", "member:manage", "role:manage",
    "department:manage", "enrollment:manage",
    "course:create", "course:update", "course:delete", "course:view",
    "assignment:view",
    "grade:view",
    "attendance:view",
    "student:view", "student:message",
    "analytics:view",
    "announcement:create", "discussion:moderate",
  ],

  DEPARTMENT_ADMIN: [
    "course:create", "course:update", "course:view",
    "enrollment:manage",
    "assignment:view",
    "grade:view",
    "attendance:view",
    "student:view", "student:message",
    "analytics:view",
    "announcement:create",
  ],

  TEACHER: [
    "course:update", "course:view",
    "assignment:create", "assignment:update", "assignment:delete",
    "assignment:view", "assignment:grade",
    "submission:view",
    "grade:view", "grade:modify", "grade:publish",
    "attendance:view", "attendance:manage",
    "student:view", "student:message",
    "analytics:view",
    "announcement:create", "discussion:post", "discussion:moderate",
  ],

  // Deliberately not a teacher with a different label: no publishing grades,
  // no deleting assignments, no course settings.
  TEACHING_ASSISTANT: [
    "course:view",
    "assignment:view", "assignment:grade",
    "submission:view",
    "grade:view", "grade:modify",
    "attendance:view", "attendance:manage",
    "student:view",
    "discussion:post",
  ],

  STUDENT: [
    "course:view",
    "assignment:view",
    "submission:create", "submission:view",
    "grade:view",
    "attendance:view",
    "discussion:post",
  ],

  // Read-only, and only about their own child — enforced in policy.ts, which
  // requires scope.studentUserId to be one they are a guardian of.
  PARENT: [
    "grade:view",
    "attendance:view",
    "assignment:view",
  ],

  COUNSELOR: [
    "student:view", "student:message",
    "grade:view",
    "attendance:view",
    "analytics:view",
  ],
} as const;

/**
 * Permissions that are meaningless without naming a specific section or
 * course. A role holding one of these must additionally be bound to the thing
 * in scope — see `policy.ts`. Listed explicitly rather than inferred from the
 * permission string, so adding a permission forces a deliberate decision about
 * whether it is course-bound.
 */
export const COURSE_BOUND: ReadonlySet<Permission> = new Set<Permission>([
  "course:update", "course:delete", "course:view",
  "assignment:create", "assignment:update", "assignment:delete",
  "assignment:view", "assignment:grade",
  "submission:create", "submission:view",
  "grade:modify", "grade:publish",
  "attendance:manage",
  "announcement:create",
  "discussion:post", "discussion:moderate",
]);

/**
 * Permissions that change or reveal something consequential enough that an AI
 * suggestion must never apply them directly. Used by the AI layer to enforce
 * the suggestion → human confirmation → action path.
 */
export const REQUIRES_HUMAN_CONFIRMATION: ReadonlySet<Permission> = new Set<Permission>([
  "grade:modify", "grade:publish",
  "assignment:delete", "course:delete",
  "enrollment:manage", "member:manage", "role:manage",
  "attendance:manage",
]);
