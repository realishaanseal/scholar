"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { QuestionKind } from "@/domains/assessment/marking";

/**
 * Sitting a quiz.
 *
 * One question per screen rather than a long scroll. A page of twenty
 * questions invites skimming and makes it easy to leave one blank without
 * noticing; one at a time with an explicit review step before submitting does
 * not. The review step matters more than the pagination — it is the last
 * moment anything can be changed, so it says plainly what is unanswered.
 *
 * Nothing here decides a mark. The server holds the answer key and does the
 * marking; this component has never been sent it and could not compute a score
 * if it wanted to.
 */

type StudentQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  options?: { id: string; body: string }[];
};

type Reviewed = {
  questionId: string;
  prompt: string;
  points: number;
  awarded: number | null;
  needsReview: boolean;
  response: { optionIds?: string[]; text?: string };
  explanation: string;
  correctOptionIds: string[];
};

type Outcome = {
  awarded: number;
  possible: number;
  needsReview: boolean;
  score: number | null;
  late: boolean;
  review: Reviewed[] | null;
};

type Answer = { optionIds?: string[]; text?: string };

export default function QuizRunner({
  assignmentId,
  questions,
  onFinished,
}: {
  assignmentId: string;
  questions: StudentQuestion[];
  onFinished?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [at, setAt] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (questions.length === 0) {
    return (
      <p className="text-[13px] text-slate-400">
        This quiz has no questions yet.
      </p>
    );
  }

  if (outcome) return <Result outcome={outcome} onDone={onFinished} />;

  const total = questions.length;
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/institution/assignments/${assignmentId}/quiz/attempts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ responses: answers }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit this attempt.");
      setOutcome(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (reviewing) {
    const unanswered = questions.filter((q) => !isAnswered(answers[q.id]));
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-[15px] font-medium text-slate-100">Before you hand this in</h3>
          <p className="mt-1 text-[13px] text-slate-400">
            {unanswered.length === 0
              ? `All ${total} answered.`
              : `${unanswered.length} of ${total} still blank. A blank answer scores nothing.`}
          </p>
        </div>

        <ol className="space-y-1.5">
          {questions.map((q, i) => {
            const done = isAnswered(answers[q.id]);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => { setReviewing(false); setAt(i); }}
                  className="flex w-full items-center gap-3 rounded-lg border border-white/[0.07] px-3 py-2 text-start transition-colors hover:border-white/[0.16] hover:bg-white/[0.03]"
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-medium",
                      done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-slate-500"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-300">
                    {q.prompt}
                  </span>
                  {!done && (
                    <span className="shrink-0 text-[11px] text-amber-300/80">Blank</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.08] px-3 py-2 text-[12.5px] text-rose-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="btn btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
          >
            {busy ? "Handing in…" : "Hand in"}
          </button>
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="btn btn-ghost px-4 py-2 text-[13px]"
          >
            Keep working
          </button>
        </div>
      </div>
    );
  }

  const q = questions[at];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-slate-500">
          Question {at + 1} of {total} · {q.points} {q.points === 1 ? "mark" : "marks"}
        </p>
        <p className="text-[12px] text-slate-500">{answeredCount}/{total} answered</p>
      </div>

      <div
        className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuenow={answeredCount}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-vx-400 transition-[width] duration-300"
          style={{ width: `${(answeredCount / total) * 100}%` }}
        />
      </div>

      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-100">
        {q.prompt}
      </p>

      <QuestionInput
        question={q}
        answer={answers[q.id]}
        onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setAt((i) => Math.max(0, i - 1))}
          disabled={at === 0}
          className="btn btn-ghost px-3.5 py-1.5 text-[12.5px] disabled:opacity-40"
        >
          Back
        </button>

        {at < total - 1 ? (
          <button
            type="button"
            onClick={() => setAt((i) => i + 1)}
            className="btn btn-ghost px-3.5 py-1.5 text-[12.5px]"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="btn btn-primary px-4 py-1.5 text-[12.5px]"
          >
            Review answers
          </button>
        )}
      </div>
    </div>
  );
}

/* ── One question's input ──────────────────────────────────────────────── */

function QuestionInput({
  question, answer, onChange,
}: {
  question: StudentQuestion;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
}) {
  if (question.kind === "short" || question.kind === "open") {
    const long = question.kind === "open";
    return (
      <textarea
        value={answer?.text ?? ""}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={long ? 8 : 2}
        placeholder={long ? "Write your answer…" : "Your answer"}
        className="input w-full resize-y text-[13px]"
      />
    );
  }

  const picked = new Set(answer?.optionIds ?? []);
  const multi = question.kind === "multi";

  return (
    <div className="space-y-1.5">
      {multi && (
        <p className="text-[11.5px] text-slate-500">
          Select all that apply. A wrong choice cancels out a right one.
        </p>
      )}
      {(question.options ?? []).map((o) => {
        const on = picked.has(o.id);
        return (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
              on
                ? "border-vx-400/50 bg-vx-400/[0.08]"
                : "border-white/[0.07] hover:border-white/[0.16] hover:bg-white/[0.03]"
            )}
          >
            <input
              type={multi ? "checkbox" : "radio"}
              name={question.id}
              checked={on}
              onChange={() => {
                if (!multi) return onChange({ optionIds: [o.id] });
                const next = new Set(picked);
                if (next.has(o.id)) next.delete(o.id);
                else next.add(o.id);
                onChange({ optionIds: [...next] });
              }}
              className="mt-0.5 shrink-0 accent-vx-400"
            />
            <span className="text-[13px] leading-relaxed text-slate-200">{o.body}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ── What happened ─────────────────────────────────────────────────────── */

function Result({ outcome, onDone }: { outcome: Outcome; onDone?: () => void }) {
  // Deliberately not a percentage when a person still owes marks: a fraction
  // of a fraction reads as a grade, and this is not one yet.
  return (
    <div className="space-y-4">
      <div>
        {outcome.needsReview ? (
          <>
            <h3 className="text-[15px] font-medium text-slate-100">Handed in</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              {outcome.awarded} of {outcome.possible} marked automatically. The written
              answers go to your teacher, so your final mark is not settled yet.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-[15px] font-medium text-slate-100">
              {outcome.awarded} out of {outcome.possible}
            </h3>
            <p className="mt-1 text-[13px] text-slate-400">
              Marked automatically{outcome.late ? " · handed in late" : ""}.
            </p>
          </>
        )}
      </div>

      {outcome.review && (
        <ol className="space-y-2.5">
          {outcome.review.map((r, i) => {
            const full = r.awarded !== null && r.awarded >= r.points;
            const none = r.awarded === 0;
            return (
              <li key={r.questionId} className="card rounded-xl px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-200">
                    <span className="text-slate-500">{i + 1}. </span>
                    {r.prompt}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 text-[12.5px] font-medium tabular-nums",
                      full ? "text-emerald-300" : none ? "text-rose-300/80" : "text-amber-300"
                    )}
                  >
                    {r.awarded}/{r.points}
                  </span>
                </div>
                {r.explanation && (
                  <p className="mt-2 border-t border-white/[0.06] pt-2 text-[12.5px] leading-relaxed text-slate-400">
                    {r.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {onDone && (
        <button type="button" onClick={onDone} className="btn btn-ghost px-4 py-2 text-[13px]">
          Back to the course
        </button>
      )}
    </div>
  );
}

function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  if ((a.optionIds ?? []).length > 0) return true;
  return (a.text ?? "").trim() !== "";
}
