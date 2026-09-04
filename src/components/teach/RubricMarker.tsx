"use client";

import { useEffect, useState } from "react";

/**
 * Marking against a rubric.
 *
 * One row per criterion, levels as buttons, saved the moment a level is
 * clicked. Saving per click rather than per form is the difference between a
 * marker who can close a tab mid-pile and one who loses an afternoon — and
 * two people moderating the same piece do not overwrite each other, because
 * each request carries one criterion rather than the whole set.
 *
 * The running total is shown but never applied. Recording a grade stays the
 * grade route's job, with its required human actor and its audit entry: a
 * rubric must not become a second, quieter way to mark somebody. What this
 * offers instead is a suggested score the marker can take with one click.
 */

type Level = { id: string; label: string; points: number };
type Criterion = { id: string; title: string; points: number; levels: Level[] };
type CriterionResult = {
  criterionId: string;
  awarded: number | null;
  possible: number;
  levelId: string | null;
  comment: string;
};
type Result = {
  criteria: CriterionResult[];
  awarded: number;
  possible: number;
  complete: boolean;
  outstanding: number;
  percentage: number | null;
};

export default function RubricMarker({
  submissionId,
  onSuggestedScore,
}: {
  submissionId: string;
  /** Offered to the marker, never applied on their behalf. */
  onSuggestedScore?: (score: number) => void;
}) {
  const [rubric, setRubric] = useState<{ title: string; criteria: Criterion[] } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/institution/submissions/${submissionId}/rubric`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setRubric(data.rubric ?? null);
        setResult(data.result ?? null);
      } catch {
        // A rubric that will not load must not take the marking screen with
        // it — the teacher can still enter a mark and feedback.
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  async function choose(criterionId: string, levelId: string) {
    setBusy(criterionId);
    setError(null);
    try {
      const res = await fetch(`/api/institution/submissions/${submissionId}/rubric`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ criterionId, levelId, points: null, comment: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that.");
      setResult(data.result);
      setSuggested(data.suggestedScore ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!rubric || rubric.criteria.length === 0) return null;

  const chosen = new Map(
    (result?.criteria ?? []).map((c) => [c.criterionId, c.levelId])
  );

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-slate-200">{rubric.title}</span>
        <span className="text-[12px] tabular-nums text-slate-500">
          {result
            ? result.complete
              ? `${result.awarded} of ${result.possible}`
              : `${result.awarded} of ${result.possible} · ${result.outstanding} left`
            : `out of ${rubric.criteria.reduce((s, c) => s + c.points, 0)}`}
        </span>
      </div>

      <div className="space-y-2">
        {rubric.criteria.map((c) => {
          const picked = chosen.get(c.id) ?? null;
          return (
            <div key={c.id}>
              <p className="mb-1 text-[12px] text-slate-300">
                {c.title}
                <span className="ms-1.5 text-[11px] text-slate-600">/ {c.points}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {c.levels.map((l) => {
                  const on = picked === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      disabled={busy === c.id}
                      aria-pressed={on}
                      onClick={() => void choose(c.id, l.id)}
                      className={
                        on
                          ? "rounded-md border border-vx-400/40 bg-vx-400/[0.14] px-2.5 py-1 text-[11.5px] text-vx-200"
                          : "rounded-md border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-slate-400 hover:border-white/20 disabled:opacity-50"
                      }
                    >
                      {l.label}
                      <span className="ms-1 tabular-nums text-[10.5px] opacity-70">
                        {l.points}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}

      {/* Offered, not applied. The marker still presses Return. */}
      {suggested !== null && onSuggestedScore && (
        <button
          type="button"
          onClick={() => onSuggestedScore(suggested)}
          className="btn btn-ghost mt-2.5 px-2.5 py-1 text-[12px]"
        >
          Use {suggested} as the mark
        </button>
      )}

      {result && !result.complete && (
        <p className="mt-2 text-[11.5px] text-slate-600">
          The rubric proposes a mark once every criterion has been decided.
        </p>
      )}
    </div>
  );
}
