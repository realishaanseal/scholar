import { z } from "zod";

/** Course and enrollment types, plus the validation route handlers use. */

export type CourseStatus = "draft" | "published" | "archived";

export type Course = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  code: string;
  title: string;
  description: string;
  credits: number | null;
  status: CourseStatus;
};

export type CourseSection = {
  id: string;
  organizationId: string;
  courseId: string;
  termId: string;
  name: string;
  capacity: number | null;
};

export type EnrollmentStatus = "active" | "dropped" | "completed";

export type Enrollment = {
  id: string;
  organizationId: string;
  courseSectionId: string;
  userId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
};

export type Module = {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  summary: string;
  position: number;
  isPublished: boolean;
  prerequisiteModuleId: string | null;
  estimatedMins: number | null;
};

export type Lesson = {
  id: string;
  organizationId: string;
  moduleId: string;
  title: string;
  kind: LessonKind;
  body: string;
  url: string | null;
  position: number;
  isPublished: boolean;
  estimatedMins: number | null;
};

export const LESSON_KINDS = ["lecture", "reading", "video", "practice", "link"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/**
 * Course codes are compared and displayed constantly, so they are normalised
 * on the way in rather than being trusted as typed. Uppercasing here is what
 * makes the (organization_id, code) unique constraint mean what people expect:
 * without it, PHY101 and phy101 would be two different courses.
 */
export const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Course code must be at least 2 characters.")
  .max(24, "Course code must be 24 characters or fewer.")
  .regex(/^[A-Z0-9][A-Z0-9 .-]*$/, "Use letters, numbers, spaces, dots or hyphens.");

export const createCourseSchema = z.object({
  code: courseCodeSchema,
  title: z.string().trim().min(2, "Title must be at least 2 characters.").max(200),
  description: z.string().trim().max(4000).default(""),
  departmentId: z.string().min(1).nullable().default(null),
  // Half-credit steps are common; anything finer is almost always a typo.
  credits: z.number().min(0).max(100).multipleOf(0.5).nullable().default(null),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const createSectionSchema = z.object({
  courseId: z.string().min(1),
  termId: z.string().min(1),
  name: z.string().trim().min(1, "Give the section a name.").max(64),
  capacity: z.number().int().positive().max(10_000).nullable().default(null),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const createModuleSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().max(2000).default(""),
  position: z.number().int().min(0).default(0),
  prerequisiteModuleId: z.string().min(1).nullable().default(null),
  estimatedMins: z.number().int().positive().max(100_000).nullable().default(null),
});
export type CreateModuleInput = z.infer<typeof createModuleSchema>;

export const createLessonSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  kind: z.enum(LESSON_KINDS).default("lecture"),
  body: z.string().max(50_000).default(""),
  url: z.string().url("Enter a valid URL.").nullable().default(null),
  position: z.number().int().min(0).default(0),
  estimatedMins: z.number().int().positive().max(100_000).nullable().default(null),
});
export type CreateLessonInput = z.infer<typeof createLessonSchema>;

/**
 * What a student may see of a module.
 *
 * Gating is computed rather than stored: an unpublished module is invisible,
 * and a module behind an incomplete prerequisite is visible but locked, so the
 * student can see that the path exists without being able to skip it.
 */
export type ModuleVisibility = "hidden" | "locked" | "open";

export function moduleVisibility(
  module: Pick<Module, "isPublished" | "prerequisiteModuleId">,
  completedModuleIds: ReadonlySet<string>
): ModuleVisibility {
  if (!module.isPublished) return "hidden";
  if (module.prerequisiteModuleId && !completedModuleIds.has(module.prerequisiteModuleId)) {
    return "locked";
  }
  return "open";
}
