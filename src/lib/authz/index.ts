/**
 * Institutional authorization.
 *
 * One primitive, `can(actor, permission, scope)`, plus `authorize()` which
 * throws instead of returning. Personal Scholar data is deliberately outside
 * this system entirely — see ./types.ts for why.
 */
export { can, explain, authorize, rolesIn, Forbidden, type Decision } from "./policy";
export { ROLE_PERMISSIONS, COURSE_BOUND, REQUIRES_HUMAN_CONFIRMATION } from "./permissions";
export { personalActor } from "./types";
export type {
  Actor, Membership, TeachingAssignment, EnrollmentRef,
  Permission, RoleId, Scope,
} from "./types";
