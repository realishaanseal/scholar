"use client";

import { useState } from "react";

/**
 * Building a rubric.
 *
 * Starts with one criterion and four levels already filled in, because a
 * blank grid is a form and a half-built rubric is an example. The default
 * levels are the ones most schools use almost verbatim, so the common case is
 * renaming rather than composing.
 *
 * Points are typed per level rather than derived from position. A rubric
 * running 4/3/2/0 is a real thing teachers build on purpose — the gap between
 * "developing" and "not yet" is deliberately larger than the others — and
 * inferring points from order would quietly rewrite it.
 */

type Level = { label: string; points: number };
type Criterion = { title: string; description: string; points: number; levels: Level[] };

const STARTER_LEVELS: Level[] = [
  { label: "Excellent", points: 4 },
  { label: "Good", points: 3 },
  { label: "Developing", points: 2 },
  { label: "Not yet", points: 0 },
];

function blankCriterion(): Criterion {
  return {
    title: "",
    description: "",
    points: 4,
    levels: STARTER_LEVELS.map((l) => ({ ...l })),
  };
}

export default function RubricBuilder({
  courseId,
  onCreated,
}: {
  courseId: string;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [shared, setShared] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([blankCriterion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = criteria.reduce((sum, c) => sum + (Number(c.points) || 0), 0);

  function patchCriterion(i: number, patch: Partial<Criterion>) {
    setCriteria((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  function patchLevel(ci: number, li: number, patch: Partial<Level>) {
    setCriteria((prev) =>
      prev.map((c, j) =>
        j === ci
          ? { ...c, levels: c.levels.map((l, k) => (k === li ? { ...l, ...patch } : l)) }
          : c
      )
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/institution/courses/${courseId}/rubrics`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          shared,
          criteria: criteria.map((c) => ({
            title: c.title,
            description: c.description,
            // The criterion is worth its best level, which is what a marker
            // means by "out of".
            points: Math.max(0, ...c.levels.map((l) => Number(l.points) || 0)),
            levels: c.levels.map((l) => ({ label: l.label, points: Number(l.points) || 0 })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the rubric.");

      setTitle("");
      setCriteria([blankCriterion()]);
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost px-3 py-1.5 text-[12.5px]"
      >
        New rubric
      </button>
    );
  }

  return (
    <form onSubmit={save} className="card rounded-xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-[11.5px] text-slate-400">Rubric name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Extended essay"
            required
            maxLength={200}
            className="input w-full"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-[12.5px] text-slate-400">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          Share across the whole school
        </label>
      </div>

      <div className="space-y-3">
        {criteria.map((c, i) => (
          <div key={i} className="rounded-lg border border-white/[0.08] px-3.5 py-3">
            <div className="flex items-start gap-2">
              <label className="block flex-1">
                <span className="mb-1 block text-[11.5px] text-slate-400">
                  Criterion {i + 1}
                </span>
                <input
                  value={c.title}
                  onChange={(e) => patchCriterion(i, { title: e.target.value })}
                  placeholder="Use of evidence"
                  required
                  maxLength={200}
                  className="input w-full"
                />
              </label>
              {criteria.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove criterion ${i + 1}`}
                  onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                  className="btn btn-ghost mt-5 px-2 py-1 text-[12px] text-slate-500"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {c.levels.map((l, j) => (
                <div key={j} className="rounded-md border border-white/[0.06] px-2 py-1.5">
                  <input
                    value={l.label}
                    onChange={(e) => patchLevel(i, j, { label: e.target.value })}
                    className="w-full bg-transparent text-[12px] text-slate-200 outline-none"
                    maxLength={120}
                    aria-label={`Level ${j + 1} name`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={l.points}
                    onChange={(e) => patchLevel(i, j, { points: Number(e.target.value) })}
                    className="mt-1 w-full bg-transparent text-[11.5px] tabular-nums text-slate-500 outline-none"
                    aria-label={`Level ${j + 1} points`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setCriteria((prev) => [...prev, blankCriterion()])}
          className="btn btn-ghost px-3 py-1.5 text-[12.5px]"
        >
          Add criterion
        </button>
        <span className="text-[12.5px] tabular-nums text-slate-500">
          Worth {total} points in total
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-[13px]">
          {saving ? "Saving…" : "Save rubric"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="btn btn-ghost px-3 py-2 text-[13px]"
        >
          Cancel
        </button>
        {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
        Each criterion is worth its best level. Levels do not have to be evenly spaced —
        4 / 3 / 2 / 0 is a common and deliberate shape.
      </p>
    </form>
  );
}
