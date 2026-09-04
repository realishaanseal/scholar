/**
 * Identity: organizations, membership, roles, and the academic calendar.
 *
 * Business logic only — no React, no HTTP. Route handlers validate input with
 * the schemas here, resolve an Actor, authorize, then call the repository.
 */
export * from "./types";
export * from "./repository";
export { toActor } from "./actor";
export type { MembershipRow, TeachingRow, EnrollmentRow } from "./actor";
export * from "./invitations";
