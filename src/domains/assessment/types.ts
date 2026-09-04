import { z } from "zod";

/** Assignment and submission types, plus the validation route handlers use. */

export type AssignmentStatus = "draft" | "published" | "archived";
export type LatePolicy = "accept" | "penalise" | "reject";
export type SubmissionType = "text" | "url" | "file" | "none";

export type AssignmentKind = "task" | "quiz";

export type Assignment = {
  id: string;
  organizationId: string;
  courseSectionId: string;
  createdBy: string | null;
  title: string;
  instructions: string;
  points: number | null;
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  submissionType: SubmissionType;
  /** task | quiz. A quiz carries questions; a task carries written work. */
  kind: AssignmentKind;
  maxAttempts: number | null;
  latePolicy: LatePolicy;
  status: AssignmentStatus;
  publishedAt: string | null;
  estimatedMins: number | null;
  /** IANA zone the deadline was written against. Null on rows that predate it. */
  dueTimezone: string | null;
  /** The rubric this is marked against, when there is one. */
  rubricId: string | null;
  /**
   * Whether filling the rubric in sets the score, or merely explains one the
   * teacher enters separately. Explicit because guessing produces a gradebook
   * nobody trusts.
   */
  rubricScores: boolean;
  /**
   * When a mark becomes visible. 'automatic' releases it as it is written;
   * 'manual' holds the pile until the teacher posts it.
   */
  gradePosting: "automatic" | "manual";
};

export type Submission = {
  id: string;
  organizationId: string;
  assignmentId: string;
  userId: string;
  attempt: number;
  status: "draft" | "submitted" | "returned";
  body: string;
  url: string | null;
  submittedAt: string | null;
  isLate: boolean;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
  gradedBy: string | null;
};

/** An instant, or nothing. Dates arrive from the client as ISO strings. */
const instant = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .default(null)
  .catch(null);

export const assignmentInputSchema = z
  .object({
    title: z.string().trim().min(2, "Give the assignment a title.").max(200),
    instructions: z.string().trim().max(20_000).default(""),
    points: z.number().min(0).max(10_000).nullable().default(null),
    availableFrom: instant,
    dueAt: instant,
    closesAt: instant,
    submissionType: z.enum(["text", "url", "file", "none"]).default("text"),
    kind: z.enum(["task", "quiz"]).default("task"),
    maxAttempts: z.number().int().positive().max(100).nullable().default(null),
    latePolicy: z.enum(["accept", "penalise", "reject"]).default("accept"),
    estimatedMins: z.number().int().positive().max(10_000).nullable().default(null),
    /**
     * The IANA zone the deadline was written against.
     *
     * The instant above is what the server compares; this is what the sentence
     * meant. Keeping both is what lets a student abroad be shown the rule in
     * the school's clock alongside their own, instead of quietly converting
     * the rule into a different one.
     */
    dueTimezone: z.string().trim().max(64).nullable().default(null),
    rubricId: z.string().trim().max(64).nullable().default(null),
    rubricScores: z.boolean().default(true),
    gradePosting: z.enum(["automatic", "manual"]).default("automatic"),
  })
  // Mirrors the CHECK constraints in migration 0004. Validating here as well
  // means a teacher gets a sentence they can act on rather than a constraint
  // violation surfacing as a 500.
  .refine((v) => !v.availableFrom || !v.dueAt || v.dueAt >= v.availableFrom, {
    message: "The deadline cannot be before the assignment opens.",
    path: ["dueAt"],
  })
  .refine((v) => !v.closesAt || !v.dueAt || v.closesAt >= v.dueAt, {
    message: "Submissions cannot close before the deadline.",
    path: ["closesAt"],
  });

export type CreateAssignmentInput = z.infer<typeof assignmentInputSchema>;
export type UpdateAssignmentInput = CreateAssignmentInput;

export const submitWorkSchema = z.object({
  body: z.string().max(100_000).default(""),
  url: z.string().url("Enter a valid link.").nullable().default(null),
});
export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;

/**
 * A grade, entered by a person.
 *
 * `score` is nullable so a teacher can return feedback without a mark, which
 * is what formative work usually wants.
 */
export const gradeSchema = z.object({
  score: z.number().min(0).max(10_000).nullable().default(null),
  feedback: z.string().max(20_000).default(""),
  /**
   * The suggestion this mark came from, when it came from one.
   *
   * Optional, and absent on every mark typed from scratch — marking without
   * assistance stays the simplest path through this code. When present it
   * does not decide the score: the score is whatever the teacher posted. It
   * only records that a model was in the room, and which one.
   */
  draftId: z.string().min(1).max(64).nullable().default(null),
});
export type GradeInput = z.infer<typeof gradeSchema>;

/**
 * Is this score within the assignment's marks?
 *
 * Kept out of the schema because the ceiling depends on the assignment being
 * graded, which the schema does not know about.
 */
export function scoreWithinBounds(score: number | null, points: number | null): boolean {
  if (score === null) return true;
  if (score < 0) return false;
  return points === null || score <= points;
}
