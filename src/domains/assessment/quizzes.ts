import { db, newId } from "@/lib/db";
import {
  forStudent, markQuiz,
  type Question, type QuestionKind, type QuestionSpec, type Response, type StudentQuestion,
} from "./marking";

/**
 * Quizzes, and the bank behind them.
 *
 * The rule this file exists to enforce: a question's answer key is loaded on
 * the server, used on the server, and never returned to a student whose
 * attempt is still open. Two read functions rather than one with a boolean —
 * `quizForTeacher` and `quizForStudent` — because a flag is something a caller
 * can get wrong, and getting this one wrong hands out the answers.
 */

/* ── The bank ──────────────────────────────────────────────────────────── */

export type BankQuestion = Question & { courseId: string; usageCount: number };

export async function listQuestions(courseId: string): Promise<BankQuestion[]> {
  const rows = await db
    .prepare(
      `SELECT q.id, q.course_id, q.kind, q.prompt, q.points, q.spec, q.explanation,
              (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.question_id = q.id) AS usage_count
         FROM questions q
        WHERE q.course_id = ?
        ORDER BY q.created_at DESC`
    )
    .all(courseId);
  return rows.map(mapQuestion);
}

export async function createQuestion(
  organizationId: string,
  courseId: string,
  createdBy: string,
  input: { kind: QuestionKind; prompt: string; points: number; spec: QuestionSpec; explanation?: string }
): Promise<BankQuestion> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO questions
         (id, organization_id, course_id, kind, prompt, points, spec, explanation, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)`
    )
    .run(
      id, organizationId, courseId, input.kind, input.prompt, input.points,
      JSON.stringify(input.spec ?? {}), input.explanation ?? "", createdBy
    );

  return {
    id, courseId, kind: input.kind, prompt: input.prompt, points: input.points,
    spec: input.spec ?? {}, explanation: input.explanation ?? "", usageCount: 0,
  };
}

export async function deleteQuestion(questionId: string): Promise<void> {
  // Cascades to quiz_questions. A question removed from the bank is removed
  // from the quizzes that used it, which is why the UI shows the usage count
  // before offering the button.
  await db.prepare(`DELETE FROM questions WHERE id = ?`).run(questionId);
}

export async function scopeOfQuestion(
  questionId: string
): Promise<{ organizationId: string; courseId: string } | null> {
  const row = await db
    .prepare(`SELECT organization_id, course_id FROM questions WHERE id = ?`)
    .get(questionId);
  return row ? { organizationId: row.organization_id, courseId: row.course_id } : null;
}

/* ── Assembling a quiz ─────────────────────────────────────────────────── */

/** Full questions, answer key included. Never call this for a student. */
export async function quizForTeacher(assignmentId: string): Promise<Question[]> {
  const rows = await db
    .prepare(
      `SELECT q.id, q.kind, q.prompt, q.spec, q.explanation,
              COALESCE(qq.points, q.points) AS points
         FROM quiz_questions qq
         JOIN questions q ON q.id = qq.question_id
        WHERE qq.assignment_id = ?
        ORDER BY qq.position, q.created_at`
    )
    .all(assignmentId);
  return rows.map(mapQuestion);
}

/**
 * What a student sitting the quiz is allowed to see.
 *
 * Redacted through the one function that does it, rather than by selecting
 * fewer columns here: a future column carrying a hint would otherwise have to
 * be remembered about in two places.
 */
export async function quizForStudent(assignmentId: string): Promise<StudentQuestion[]> {
  const full = await quizForTeacher(assignmentId);
  return full.map(forStudent);
}

export async function setQuizQuestions(
  organizationId: string,
  assignmentId: string,
  questionIds: string[]
): Promise<void> {
  await db.prepare(`DELETE FROM quiz_questions WHERE assignment_id = ?`).run(assignmentId);
  for (const [i, questionId] of questionIds.entries()) {
    await db
      .prepare(
        `INSERT INTO quiz_questions (id, organization_id, assignment_id, question_id, position)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (assignment_id, question_id) DO UPDATE SET position = EXCLUDED.position`
      )
      .run(newId(), organizationId, assignmentId, questionId, i);
  }
}

/** The sum of what a quiz is out of, so publishing can stamp it on the assignment. */
export async function quizTotalPoints(assignmentId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(qq.points, q.points)), 0) AS total
         FROM quiz_questions qq JOIN questions q ON q.id = qq.question_id
        WHERE qq.assignment_id = ?`
    )
    .get(assignmentId);
  return Number(row?.total ?? 0);
}

/* ── Sitting the quiz ──────────────────────────────────────────────────── */

export type AttemptOutcome = {
  submissionId: string;
  awarded: number;
  possible: number;
  needsReview: boolean;
  /** Withheld until every question on the attempt has been settled. */
  score: number | null;
};

/**
 * Record and mark one attempt.
 *
 * Marking happens here, from questions loaded here, against responses posted
 * by the student — the client is never asked what it scored, and never told
 * what the answers were on the way in.
 *
 * The score is written to the submission only when the machine could settle
 * every question. If any open question is waiting on a person, the attempt
 * stays `submitted` and appears in the marking queue with the auto-marked
 * portion already filled in, rather than being returned with a score that is
 * silently missing an essay's worth of marks.
 */
export async function submitQuizAttempt(input: {
  organizationId: string;
  assignmentId: string;
  userId: string;
  attempt: number;
  isLate: boolean;
  responses: Record<string, Response>;
}): Promise<AttemptOutcome> {
  const questions = await quizForTeacher(input.assignmentId);
  const result = markQuiz(questions, input.responses);

  const submissionId = newId();
  const settled = !result.needsReview;

  await db
    .prepare(
      `INSERT INTO assignment_submissions
         (id, organization_id, assignment_id, user_id, attempt, status,
          body, submitted_at, is_late, score, graded_at)
       VALUES (?, ?, ?, ?, ?, ?, '', now(), ?, ?, ?)`
    )
    .run(
      submissionId, input.organizationId, input.assignmentId, input.userId,
      input.attempt,
      // Returned outright only when nothing is left for a human to do.
      settled ? "returned" : "submitted",
      input.isLate,
      settled ? result.awarded : null,
      settled ? new Date().toISOString() : null
    );

  for (const q of result.perQuestion) {
    await db
      .prepare(
        `INSERT INTO quiz_responses
           (id, organization_id, submission_id, question_id, response, awarded, needs_review)
         VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`
      )
      .run(
        newId(), input.organizationId, submissionId, q.questionId,
        JSON.stringify(input.responses[q.questionId] ?? {}),
        q.awarded, q.needsReview
      );
  }

  return {
    submissionId,
    awarded: result.awarded,
    possible: result.possible,
    needsReview: result.needsReview,
    score: settled ? result.awarded : null,
  };
}

/**
 * A marked attempt, as the student may now see it.
 *
 * Only ever called once the attempt has been marked, which is what makes it
 * safe to include the explanation and whether each answer was right — both of
 * which would be the answer key if handed over any earlier.
 */
export type ReviewedQuestion = {
  questionId: string;
  prompt: string;
  kind: QuestionKind;
  points: number;
  awarded: number | null;
  needsReview: boolean;
  response: Response;
  explanation: string;
  correctOptionIds: string[];
};

export async function reviewAttempt(submissionId: string): Promise<ReviewedQuestion[]> {
  const rows = await db
    .prepare(
      `SELECT r.question_id, r.response, r.awarded, r.needs_review,
              q.prompt, q.kind, q.spec, q.explanation,
              COALESCE(qq.points, q.points) AS points
         FROM quiz_responses r
         JOIN questions q ON q.id = r.question_id
         LEFT JOIN quiz_questions qq ON qq.question_id = q.id
         JOIN assignment_submissions s ON s.id = r.submission_id
                                      AND qq.assignment_id = s.assignment_id
        WHERE r.submission_id = ?
        ORDER BY qq.position`
    )
    .all(submissionId);

  return rows.map((r: any) => {
    const spec: QuestionSpec = typeof r.spec === "string" ? JSON.parse(r.spec) : (r.spec ?? {});
    return {
      questionId: r.question_id,
      prompt: r.prompt,
      kind: r.kind,
      points: Number(r.points),
      awarded: r.awarded === null || r.awarded === undefined ? null : Number(r.awarded),
      needsReview: Boolean(r.needs_review),
      response: typeof r.response === "string" ? JSON.parse(r.response) : (r.response ?? {}),
      explanation: r.explanation ?? "",
      correctOptionIds: (spec.options ?? []).filter((o) => o.correct).map((o) => o.id),
    };
  });
}

/* ── Mapping ───────────────────────────────────────────────────────────── */

function mapQuestion(r: any): BankQuestion {
  return {
    id: r.id,
    courseId: r.course_id,
    kind: r.kind,
    prompt: r.prompt,
    points: Number(r.points),
    // pg returns jsonb already parsed; a text column would not.
    spec: typeof r.spec === "string" ? JSON.parse(r.spec) : (r.spec ?? {}),
    explanation: r.explanation ?? "",
    usageCount: Number(r.usage_count ?? 0),
  };
}

/* ── Input validation ──────────────────────────────────────────────────── */

import { z } from "zod";

const optionSchema = z.object({
  id: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(2000),
  correct: z.boolean().optional(),
});

const acceptSchema = z.object({
  text: z.string().trim().min(1).max(500),
  mode: z.enum(["exact", "ci"]).optional(),
});

/**
 * A question, as a teacher may write one.
 *
 * The refinements are the ones that stop a question being unanswerable rather
 * than merely odd: a choice question with nothing correct can never be got
 * right, and a short-answer question with no accepted answer is the same
 * problem wearing a different hat. Both are worth rejecting at the boundary,
 * because the alternative is a student meeting them mid-test.
 */
export const questionInputSchema = z
  .object({
    kind: z.enum(["choice", "multi", "short", "open"]),
    prompt: z.string().trim().min(1).max(5000),
    points: z.number().min(0).max(1000),
    explanation: z.string().trim().max(5000).optional(),
    options: z.array(optionSchema).max(20).optional(),
    accept: z.array(acceptSchema).max(20).optional(),
    guidance: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "choice" || v.kind === "multi") {
      const options = v.options ?? [];
      if (options.length < 2) {
        ctx.addIssue({ code: "custom", message: "Give at least two options." });
        return;
      }
      const correct = options.filter((o) => o.correct).length;
      if (correct === 0) {
        ctx.addIssue({ code: "custom", message: "Mark at least one option correct." });
      }
      if (v.kind === "choice" && correct > 1) {
        ctx.addIssue({
          code: "custom",
          message: "A single-answer question can only have one correct option.",
        });
      }
      if (new Set(options.map((o) => o.id)).size !== options.length) {
        ctx.addIssue({ code: "custom", message: "Option ids must be unique." });
      }
    }
    if (v.kind === "short" && (v.accept ?? []).length === 0) {
      ctx.addIssue({ code: "custom", message: "Give at least one accepted answer." });
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Fold the flat input into the stored spec shape. */
export function specFromInput(input: QuestionInput): QuestionSpec {
  switch (input.kind) {
    case "choice":
    case "multi":
      return { options: input.options ?? [] };
    case "short":
      return { accept: input.accept ?? [] };
    default:
      return input.guidance ? { guidance: input.guidance } : {};
  }
}

export const quizQuestionsSchema = z.object({
  questionIds: z.array(z.string().min(1)).max(200),
});

export const quizAttemptSchema = z.object({
  responses: z.record(
    z.string(),
    z.object({
      optionIds: z.array(z.string().max(64)).max(20).optional(),
      text: z.string().max(20000).optional(),
    })
  ),
});
