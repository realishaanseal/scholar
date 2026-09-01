import { z } from "zod";
import type { RoleId } from "@/lib/authz";

/**
 * Identity domain types and input validation.
 *
 * Business logic only — nothing here imports React, and nothing here renders.
 * Route handlers validate with these schemas, call the service, and serialise
 * the result; the rules live here so they are testable without HTTP.
 */

export type Organization = {
  id: string;
  name: string;
  slug: string;
  /** The institution's own timezone, distinct from any member's. */
  timezone: string;
  locale: string;
  createdAt: string;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: RoleId;
  departmentId: string | null;
  status: "active" | "invited" | "suspended";
  createdAt: string;
};

export type Department = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
};

export type AcademicYear = {
  id: string;
  organizationId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export type Term = {
  id: string;
  organizationId: string;
  academicYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
};

export const ROLE_IDS = [
  "SUPER_ADMIN",
  "INSTITUTION_ADMIN",
  "DEPARTMENT_ADMIN",
  "TEACHER",
  "TEACHING_ASSISTANT",
  "STUDENT",
  "PARENT",
  "COUNSELOR",
] as const;

/**
 * A URL-safe identifier for the institution.
 *
 * Constrained rather than free text because it will end up in paths and
 * subdomains, where a space or a slash stops being cosmetic.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters.")
  .max(48, "Slug must be 48 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

/** IANA zone name. Validated against the runtime rather than a hardcoded list. */
export const timezoneSchema = z
  .string()
  .trim()
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Not a recognised timezone (expected something like Asia/Kolkata)." }
  );

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(160),
  slug: slugSchema,
  timezone: timezoneSchema.default("UTC"),
  locale: z.string().trim().min(2).max(12).default("en"),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLE_IDS),
  departmentId: z.string().min(1).nullable().default(null),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

/** A calendar day, not an instant — terms start on a date. */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");

export const academicYearSchema = z
  .object({
    name: z.string().trim().min(2).max(64),
    startsOn: dateOnly,
    endsOn: dateOnly,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: "The year must end after it starts.",
    path: ["endsOn"],
  });
export type AcademicYearInput = z.infer<typeof academicYearSchema>;

export const termSchema = z
  .object({
    academicYearId: z.string().min(1),
    name: z.string().trim().min(1).max(64),
    startsOn: dateOnly,
    endsOn: dateOnly,
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: "The term must end after it starts.",
    path: ["endsOn"],
  });
export type TermInput = z.infer<typeof termSchema>;
