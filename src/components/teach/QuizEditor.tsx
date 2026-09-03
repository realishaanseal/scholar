"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { QuestionKind } from "@/domains/assessment/marking";

/**
 * Building a quiz.
 *
 * Two things are happening on this screen and they are deliberately not the
 * same thing: the course has a bank of questions, and this quiz uses some of
 * them. Writing a question adds it to the bank, which is what makes it
 * available to next term's paper as well as this one.
 *
 * Editing is blocked once a quiz is published, because changing the paper
 * under people who have already sat it would silently invalidate their marks.
 * The interface says that rather than disabling a button with no explanation.
 */

type Option = { id: string; body: string; correct?: boolean };

type BankQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  spec: { options?: Option[]; accept?: { text: string; mode?: string }[] };
  explanation: string;
  usageCount: number;
};

const KINDS: { id: QuestionKind; label: string; hint: string }[] = [
  { id: "choice", label: "One answer", hint: "Marked instantly" },
  { id: "multi", label: "Several answers", hint: "Partial credit" },
  { id: "short", label: "Short answer", hint: "Matched on text" },
  { id: "open", label: "Written answer", hint: "You mark it" },
];

export default function QuizEditor({
  assignmentId,
  courseId,
  published,
}: {
  assignmentId: string;
  courseId: string;
  published: boolean;
}) {
  const [onQuiz, setOnQuiz] = useState<BankQuestion[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [quizRes, bankRes] = await Promise.all([
        fetch(`/api/institution/assignments/${assignmentId}/quiz`),
        fetch(`/api/institution/courses/${courseId}/questions`),
      ]);
      const quiz = await quizRes.json().catch(() => ({ questions: [] }));
      const all = await bankRes.json().catch(() => ({ questions: [] }));
      setOnQuiz(quiz.questions ?? []);
      setBank(all.questions ?? []);
      setLoading(false);
    })();
  }, [assignmentId, courseId]);

  async function save(ids: string[]) {
    setError(null);
    const res = await fetch(`/api/institution/assignments/${assignmentId}/quiz`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not save the question list.");
      return;
    }
    setOnQuiz(data.questions ?? []);
  }

  const total = onQuiz.reduce((n, q) => n + q.points, 0);
  const autoMarked = onQuiz.filter((q) => q.kind !== "open").length;

  if (loading) return <div className="skeleton-shimmer h-28 rounded-xl" />;

  return (
    <div className="space-y-4">
      {published && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
          This quiz is published. Unpublish it before changing the questions —
          otherwise anyone who has already sat it would be marked against a paper
          they never saw.
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-slate-500">
          {onQuiz.length} {onQuiz.length === 1 ? "question" : "questions"} · {total}{" "}
          {total === 1 ? "mark" : "marks"}
          {onQuiz.length > 0 && (
            <>
              {" · "}
              {autoMarked === onQuiz.length
                ? "all marked automatically"
                : `${onQuiz.length - autoMarked} for you to mark`}
            </>
          )}
        </p>
        {!published && (
          <button
            type="button"
            onClick={() => setWriting((v) => !v)}
            className="btn btn-ghost px-3 py-1.5 text-[12.5px]"
          >
            {writing ? "Cancel" : "Write a question"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.08] px-3 py-2 text-[12.5px] text-rose-200">
          {error}
        </p>
      )}

      {writing && (
        <QuestionForm
          courseId={courseId}
          onCreated={(q) => {
            setBank((prev) => [q, ...prev]);
            void save([...onQuiz.map((x) => x.id), q.id]);
            setWriting(false);
          }}
        />
      )}

      {onQuiz.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-slate-200">No questions yet</p>
          <p className="mt-1.5 max-w-[40ch] text-[13px] leading-relaxed text-slate-400">
            Write one, or add one you have used before from the bank below.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {onQuiz.map((q, i) => (
            <li key={q.id} className="card rounded-xl px-3.5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10.5px] text-slate-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-slate-200">{q.prompt}</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    {KINDS.find((k) => k.id === q.kind)?.label} · {q.points}{" "}
                    {q.points === 1 ? "mark" : "marks"}
                  </p>
                </div>
                {!published && (
                  <button
                    type="button"
                    onClick={() => void save(onQuiz.filter((x) => x.id !== q.id).map((x) => x.id))}
                    className="shrink-0 text-[11.5px] text-slate-500 transition-colors hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!published && bank.some((b) => !onQuiz.some((q) => q.id === b.id)) && (
        <details className="card rounded-xl px-3.5 py-3">
          <summary className="cursor-pointer text-[12.5px] text-slate-400">
            Add from the course bank
          </summary>
          <ul className="mt-2.5 space-y-1.5">
            {bank
              .filter((b) => !onQuiz.some((q) => q.id === b.id))
              .map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => void save([...onQuiz.map((x) => x.id), b.id])}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.07] px-3 py-2 text-start transition-colors hover:border-white/[0.16] hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-300">
                      {b.prompt}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-600">
                      {b.usageCount > 0 ? `used ${b.usageCount}×` : "unused"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ── Writing one ───────────────────────────────────────────────────────── */

function QuestionForm({
  courseId,
  onCreated,
}: {
  courseId: string;
  onCreated: (q: BankQuestion) => void;
}) {
  const [kind, setKind] = useState<QuestionKind>("choice");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<Option[]>([
    { id: "a", body: "", correct: true },
    { id: "b", body: "" },
  ]);
  const [accept, setAccept] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picksOptions = kind === "choice" || kind === "multi";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { kind, prompt, points, explanation };
      if (picksOptions) body.options = options.filter((o) => o.body.trim());
      if (kind === "short") body.accept = accept.filter((a) => a.trim()).map((text) => ({ text }));

      const res = await fetch(`/api/institution/courses/${courseId}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save this question.");
      onCreated(data.question);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3.5 rounded-xl px-4 py-4">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-start transition-colors",
              kind === k.id
                ? "border-vx-400/50 bg-vx-400/[0.08]"
                : "border-white/[0.07] hover:border-white/[0.16]"
            )}
          >
            <span className="block text-[12.5px] text-slate-200">{k.label}</span>
            <span className="block text-[10.5px] text-slate-500">{k.hint}</span>
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="What are you asking?"
        className="input w-full resize-y text-[13px]"
      />

      {picksOptions && (
        <div className="space-y-1.5">
          <p className="text-[11.5px] text-slate-500">
            {kind === "choice" ? "Mark the one correct answer." : "Mark every correct answer."}
          </p>
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type={kind === "choice" ? "radio" : "checkbox"}
                name="correct"
                checked={Boolean(o.correct)}
                onChange={() =>
                  setOptions((prev) =>
                    prev.map((x, j) =>
                      kind === "choice"
                        ? { ...x, correct: i === j }
                        : j === i
                          ? { ...x, correct: !x.correct }
                          : x
                    )
                  )
                }
                className="shrink-0 accent-vx-400"
              />
              <input
                value={o.body}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, body: e.target.value } : x))
                  )
                }
                placeholder={`Option ${i + 1}`}
                className="input flex-1 text-[12.5px]"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-[11.5px] text-slate-500 hover:text-rose-300"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setOptions((prev) => [
                ...prev,
                { id: String.fromCharCode(97 + prev.length), body: "" },
              ])
            }
            className="text-[11.5px] text-slate-500 hover:text-slate-300"
          >
            + Another option
          </button>
        </div>
      )}

      {kind === "short" && (
        <div className="space-y-1.5">
          <p className="text-[11.5px] text-slate-500">
            Any of these counts as right. Case and surrounding spaces are ignored.
          </p>
          {accept.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={a}
                onChange={(e) =>
                  setAccept((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                }
                placeholder="Accepted answer"
                className="input flex-1 text-[12.5px]"
              />
              {accept.length > 1 && (
                <button
                  type="button"
                  onClick={() => setAccept((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-[11.5px] text-slate-500 hover:text-rose-300"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAccept((prev) => [...prev, ""])}
            className="text-[11.5px] text-slate-500 hover:text-slate-300"
          >
            + Another accepted answer
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12.5px] text-slate-400">
          Marks
          <input
            type="number"
            min={0}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="input w-20 text-[12.5px]"
          />
        </label>
      </div>

      <input
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Why that is the answer — shown after marking (optional)"
        className="input w-full text-[12.5px]"
      />

      {error && (
        <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.08] px-3 py-2 text-[12.5px] text-rose-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void create()}
        disabled={busy || !prompt.trim()}
        className="btn btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add to quiz"}
      </button>
    </div>
  );
}
