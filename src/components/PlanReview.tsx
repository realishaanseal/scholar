"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

export type PlannedSession = {
  title: string;
  subject: string;
  dueAt: string;
  estimateMins: number;
  priority: "low" | "normal" | "high";
  details: string;
  forAssessment: string;
};

export type ParsedSyllabus = {
  course: string;
  subject: string;
  term: string | null;
  topics: Array<{ title: string; reference: string | null }>;
  assessments: Array<{
    title: string;
    kind: string;
    dueAt: string | null;
    weightPercent: number | null;
    topics: string[];
  }>;
  gradingNotes: string;
  confidence: number;
  notes: string;
};

/**
 * Review a syllabus-derived study plan before any of it is saved.
 *
 * Nothing here is committed until the student presses the button — the spec's
 * review-before-save rule applies to generated plans just as much as to single
 * parsed tasks, and a plan is far more disruptive to undo.
 */
export default function PlanReview({
  syllabus,
  plan,
  filename,
  onCommitted,
  onDiscard,
}: {
  syllabus: ParsedSyllabus;
  plan: PlannedSession[];
  filename: string;
  onCommitted: () => void;
  onDiscard: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(plan.map((_, i) => i)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function commit() {
    const items = plan
      .filter((_, i) => selected.has(i))
      .map((s) => ({
        title: s.title,
        details: s.details,
        subject: s.subject,
        dueAt: s.dueAt,
        priority: s.priority,
        estimateMins: s.estimateMins,
      }));

    if (items.length === 0) return;

    setSaving(true);
    setError(null);
    const { ok, error } = await fetchJson("/api/homework/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, source: "plan" }),
    });
    setSaving(false);

    if (ok) onCommitted();
    else setError(error ?? "Couldn't save the plan.");
  }

  const dated = syllabus.assessments.filter((a) => a.dueAt);

  return (
    <div className="card-aurora animate-popIn">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white">{syllabus.course}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {syllabus.subject}
              {syllabus.term ? ` · ${syllabus.term}` : ""} · from {filename}
            </p>
          </div>
          <span className="chip border border-white/10 bg-white/[0.04] text-[11px] text-slate-400">
            {Math.round(syllabus.confidence * 100)}% confident
          </span>
        </div>

        {/* What was found in the document */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Panel title={`${dated.length} assessment${dated.length === 1 ? "" : "s"} with dates`}>
            {dated.length === 0 ? (
              <p className="text-[11px] text-slate-600">No dated assessments found.</p>
            ) : (
              <ul className="space-y-1.5">
                {dated.slice(0, 6).map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <span className="truncate text-slate-300">{a.title}</span>
                    <span className="shrink-0 text-slate-600">
                      {new Date(a.dueAt!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {a.weightPercent ? ` · ${a.weightPercent}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`${syllabus.topics.length} topic${syllabus.topics.length === 1 ? "" : "s"}`}>
            {syllabus.topics.length === 0 ? (
              <p className="text-[11px] text-slate-600">No topic list found.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {syllabus.topics.slice(0, 10).map((t, i) => (
                  <span key={i} className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-slate-400">
                    {t.title}
                  </span>
                ))}
                {syllabus.topics.length > 10 && (
                  <span className="px-1 text-[10.5px] text-slate-600">+{syllabus.topics.length - 10}</span>
                )}
              </div>
            )}
          </Panel>
        </div>

        {syllabus.notes && (
          <p className="mt-3 text-[11px] text-amber-300/80">{syllabus.notes}</p>
        )}

        {/* The generated plan */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">
              Suggested study plan
              <span className="ml-2 font-normal text-slate-500">
                {selected.size} of {plan.length} selected
              </span>
            </h3>
            {plan.length > 0 && (
              <button
                className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
                onClick={() =>
                  setSelected(selected.size === plan.length ? new Set() : new Set(plan.map((_, i) => i)))
                }
              >
                {selected.size === plan.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>

          {plan.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center text-xs text-slate-500">
              No dated assessments in the future, so there&apos;s nothing to schedule yet.
            </p>
          ) : (
            <div className="mt-3 max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
              {plan.map((s, i) => {
                const on = selected.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      on
                        ? "border-white/12 bg-white/[0.05]"
                        : "border-white/[0.05] bg-transparent opacity-50"
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        on ? "border-vx-400 bg-vx-500/30" : "border-white/20"
                      }`}
                    >
                      {on && (
                        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-slate-200">{s.title}</span>
                      <span className="block text-[11px] text-slate-600">
                        {new Date(s.dueAt).toLocaleDateString(undefined, {
                          weekday: "short", day: "numeric", month: "short",
                        })}
                        {" · "}{s.estimateMins}m
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            className="btn-primary px-5 py-2.5"
            onClick={commit}
            disabled={saving || selected.size === 0}
          >
            {saving ? "Adding…" : `Add ${selected.size} task${selected.size === 1 ? "" : "s"}`}
          </button>
          <button className="btn-ghost px-4 py-2.5" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <p className="ml-auto text-[11px] text-slate-600">
            Nothing is saved until you add it.
          </p>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">{title}</h4>
      {children}
    </div>
  );
}
