"use client";

import { useEffect, useState } from "react";

/**
 * How your work did, criterion by criterion.
 *
 * The reason a rubric exists. A mark of 14/20 tells a student what happened;
 * "Use of evidence — Developing, 2 of 4" tells them what to do differently,
 * which is the only part that changes anything.
 *
 * Shown only once the work has been returned. Before that the server sends no
 * result at all — a half-filled rubric is a marker's working-out, and reading
 * someone's provisional judgement of you is worse than waiting.
 */

type CriterionResult = {
  criterionId: string;
  title: string;
  awarded: number | null;
  possible: number;
  levelLabel: string | null;
  comment: string;
};

type Result = {
  criteria: CriterionResult[];
  awarded: number;
  possible: number;
  complete: boolean;
  percentage: number | null;
};

export default function RubricResult({ submissionId }: { submissionId: string }) {
  const [rubric, setRubric] = useState<{ title: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

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
        setPending(Boolean(data.pending));
      } catch {
        // Silent: the mark and any written feedback are shown separately and
        // are the more important half.
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  if (!rubric) return null;

  if (pending || !result) {
    return (
      <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-[12.5px] text-slate-500">
        Marked against <span className="text-slate-300">{rubric.title}</span>. You will see
        how you did on each part once your teacher returns it.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-slate-200">{rubric.title}</span>
        {result.complete && (
          <span className="text-[12.5px] tabular-nums text-slate-400">
            {result.awarded} of {result.possible}
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {result.criteria.map((c) => (
          <li key={c.criterionId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[12.5px] text-slate-300">{c.title}</span>
            {c.levelLabel && (
              <span className="text-[12px] text-vx-300">{c.levelLabel}</span>
            )}
            <span className="text-[12px] tabular-nums text-slate-500">
              {c.awarded === null ? "—" : `${c.awarded} of ${c.possible}`}
            </span>
            {c.comment && (
              <span className="w-full text-[12px] leading-relaxed text-slate-400">
                {c.comment}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
