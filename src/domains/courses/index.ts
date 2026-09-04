/**
 * Courses: offerings, sections, enrollment and module content.
 *
 * Business logic only. Section membership here — section_teachers and
 * enrollments — is what the authorization layer binds a role to; without it a
 * TEACHER reaches no section and every course-bound permission is denied.
 */
export * from "./types";
export * from "./repository";
export * from "./copy";
