/**
 * Marking a quiz.
 *
 * Pure, and deliberately free of any database import, because this is the
 * arithmetic a student will one day ask a teacher to justify. The same
 * reasoning as the gradebook: contestable logic is testable logic.
 *
 * The decisions worth arguing about are all in one place here rather than
 * spread across a route handler:
 *
 *   - A multi-select is scored on correct picks minus wrong ones, never below
 *     zero. All-or-nothing would punish a student who understood three
 *     quarters of a question exactly as hard as one who understood none, and
 *     unpenalised partial credit would make ticking every box the optimal
 *     strategy. Neither is a defensible thing to tell someone.
 *
 *   - A short answer is matched exactly or case-insensitively, always after
 *     trimming. There is no fuzzy or edit-distance matching, because deciding
 *     that "photosynthisis" is close enough is a teaching judgement, not a
 *     default a system should quietly make on a teacher's behalf.
 *
 *   - An open question is never auto-marked, and its presence means the quiz
 *     is not finished being marked. The auto-marked half must not present
 *     itself as a final score while a human still owes the student an answer.
 */

export type QuestionKind = "choice" | "multi" | "short" | "open";

export type Option = { id: string; body: string; correct?: boolean };
export type Accept = { text: string; mode?: "exact" | "ci" };

export type QuestionSpec = {
  options?: Option[];
  accept?: Accept[];
  guidance?: string;
};

export type Question = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  spec: QuestionSpec;
  explanation?: string;
};

export type Response = {
  optionIds?: string[];
  text?: string;
};

export type QuestionResult = {
  questionId: string;
  awarded: number | null;
  points: number;
  /** Null when nothing can be said yet, i.e. a human has not marked it. */
  correct: boolean | null;
  needsReview: boolean;
  answered: boolean;
};

export type QuizResult = {
  perQuestion: QuestionResult[];
  /** Points settled by the machine. Not the final score if anything awaits. */
  awarded: number;
  /** Everything on the quiz, whether marked yet or not. */
  possible: number;
  /** True while any question still needs a person. */
  needsReview: boolean;
  reviewCount: number;
  answeredCount: number;
};

/** Mark one question. Returns null awarded when only a human can decide. */
export function markQuestion(question: Question, response: Response | undefined): QuestionResult {
  const points = Number.isFinite(question.points) ? question.points : 0;
  const answered = hasAnswer(question, response);

  // Open questions are never machine-marked, answered or not. An unanswered
  // one still needs a person to record the zero, because "they wrote nothing"
  // and "nobody has looked" are different states and only one of them is the
  // student's fault.
  if (question.kind === "open") {
    return {
      questionId: question.id,
      awarded: null,
      points,
      correct: null,
      needsReview: true,
      answered,
    };
  }

  if (!answered) {
    return {
      questionId: question.id,
      awarded: 0,
      points,
      correct: false,
      needsReview: false,
      answered: false,
    };
  }

  const fraction = scoreFraction(question, response!);
  const awarded = round2(points * fraction);

  return {
    questionId: question.id,
    awarded,
    points,
    correct: fraction >= 1,
    needsReview: false,
    answered: true,
  };
}

/** Mark a whole attempt. */
export function markQuiz(
  questions: Question[],
  responses: Record<string, Response | undefined>
): QuizResult {
  const perQuestion = questions.map((q) => markQuestion(q, responses[q.id]));

  let awarded = 0;
  let possible = 0;
  let reviewCount = 0;
  let answeredCount = 0;

  for (const r of perQuestion) {
    possible += r.points;
    if (r.awarded !== null) awarded += r.awarded;
    if (r.needsReview) reviewCount++;
    if (r.answered) answeredCount++;
  }

  return {
    perQuestion,
    awarded: round2(awarded),
    possible: round2(possible),
    needsReview: reviewCount > 0,
    reviewCount,
    answeredCount,
  };
}

/* ── Scoring, per kind ─────────────────────────────────────────────────── */

function scoreFraction(question: Question, response: Response): number {
  switch (question.kind) {
    case "choice":
      return markChoice(question.spec, response) ? 1 : 0;
    case "multi":
      return markMulti(question.spec, response);
    case "short":
      return markShort(question.spec, response) ? 1 : 0;
    default:
      return 0;
  }
}

function markChoice(spec: QuestionSpec, response: Response): boolean {
  const picked = response.optionIds ?? [];
  // Exactly one pick. Two selections on a single-answer question is not a
  // half-right answer, it is a misread question.
  if (picked.length !== 1) return false;
  const correct = (spec.options ?? []).filter((o) => o.correct).map((o) => o.id);
  return correct.includes(picked[0]);
}

/**
 * Correct picks minus wrong picks, over the number of correct options,
 * floored at zero. Ticking everything scores zero on a question with any
 * wrong option, which is the property that makes the partial credit honest.
 */
function markMulti(spec: QuestionSpec, response: Response): number {
  const options = spec.options ?? [];
  const correct = new Set(options.filter((o) => o.correct).map((o) => o.id));
  if (correct.size === 0) return 0;

  // Ignore anything that is not an option on this question, and count each
  // pick once — a repeated id must not earn the mark twice.
  const valid = new Set(options.map((o) => o.id));
  const picked = new Set((response.optionIds ?? []).filter((id) => valid.has(id)));

  let hits = 0;
  let misses = 0;
  for (const id of picked) {
    if (correct.has(id)) hits++;
    else misses++;
  }

  return Math.max(0, (hits - misses) / correct.size);
}

function markShort(spec: QuestionSpec, response: Response): boolean {
  const given = (response.text ?? "").trim();
  if (given === "") return false;

  return (spec.accept ?? []).some((a) => {
    const want = a.text.trim();
    // Case-insensitive is the default because capitalisation is almost never
    // the thing being assessed; a teacher wanting it exact says so.
    return a.mode === "exact" ? given === want : given.toLowerCase() === want.toLowerCase();
  });
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function hasAnswer(question: Question, response: Response | undefined): boolean {
  if (!response) return false;
  if (question.kind === "short" || question.kind === "open") {
    return (response.text ?? "").trim() !== "";
  }
  return (response.optionIds ?? []).length > 0;
}

function round2(n: number): number {
  // Via Math.round rather than toFixed so the result is a number with no
  // floating-point tail: a mark shown as 2.9999999999 is a mark nobody trusts.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ── Redaction ─────────────────────────────────────────────────────────── */

export type StudentQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  /** Bodies only. Correctness is stripped, not merely omitted from the type. */
  options?: { id: string; body: string }[];
};

/**
 * The only shape a question may take on its way to a student who has not yet
 * been marked.
 *
 * This exists because `spec` holds the answer key, and a payload containing
 * the right answer is not protected by the client happening not to display
 * it — anyone can open the network tab. So the answer key never leaves the
 * server for an in-progress attempt, and this is the single function that
 * decides what does.
 *
 * Accepts the full question and returns a new object rather than deleting
 * fields from the original: a mutation would be one shared reference away
 * from stripping the answers the marker is about to need.
 */
export function forStudent(question: Question): StudentQuestion {
  const out: StudentQuestion = {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    points: question.points,
  };

  if (question.kind === "choice" || question.kind === "multi") {
    out.options = (question.spec.options ?? []).map((o) => ({ id: o.id, body: o.body }));
  }

  return out;
}
