"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import type { DraftHomework } from "@/lib/clientTypes";
import { toLocalInputValue, fromLocalInputValue, formatDue } from "@/lib/format";

/**
 * The approval step. AI proposes, the student disposes — nothing is saved
 * until they've seen the cleaned-up version and had a chance to fix it.
 */
export default function ReviewCard({
  draft,
  knownSubjects,
  onSave,
  onDiscard,
  saving,
}: {
  draft: DraftHomework;
  knownSubjects: string[];
  onSave: (d: DraftHomework) => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const [d, setD] = useState<DraftHomework>(draft);
  const [showRaw, setShowRaw] = useState(false);

  function set<K extends keyof DraftHomework>(key: K, value: DraftHomework[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  const confidencePct = d.aiConfidence != null ? Math.round(d.aiConfidence * 100) : null;

  return (
    <div className="card-aurora">
      <div className="p-5 xl:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="chip border border-vx-500/25 bg-vx-500/[0.12] text-vx-200">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 2l1.9 5.5L19 9l-5.1 1.5L12 16l-1.9-5.5L5 9l5.1-1.5z"/></svg>
            AI cleaned this up
          </span>
          {confidencePct != null && <ConfidenceMeter pct={confidencePct} />}
          <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            {d.provider}
          </span>
        </div>
        <button onClick={() => setShowRaw((s) => !s)} className="text-xs text-slate-500 hover:text-slate-300">
          {showRaw ? "Hide" : "Show"} what you said
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showRaw && (
          <motion.p
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-950/60 p-3 text-xs italic leading-relaxed text-slate-500"
          >
            "{d.rawInput}"
          </motion.p>
        )}
      </AnimatePresence>

      {d.degraded && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3 text-xs leading-relaxed text-amber-200/90">
          <div className="flex items-start gap-2.5">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <div className="min-w-0">
              <div className="font-medium text-amber-200">
                No AI model ran — this was parsed by the built-in offline fallback.
              </div>
              {d.providerError ? (
                <p className="mt-1 text-amber-200/75">{d.providerError}</p>
              ) : (
                <p className="mt-1 text-amber-200/75">
                  The offline parser tidies spacing and spots common deadline phrases, but it can't
                  fix spelling or rewrite a messy note.
                </p>
              )}
              <Link
                href="/settings"
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-amber-100 underline-offset-2 hover:underline"
              >
                Connect an AI in Settings
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label">Task</label>
          <input className="input" value={d.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <label className="label">Details</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={d.details}
            placeholder="Pages, questions, format…"
            onChange={(e) => set("details", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              list="known-subjects"
              value={d.subject}
              onChange={(e) => set("subject", e.target.value)}
            />
            <datalist id="known-subjects">
              {knownSubjects.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Due</label>
            <input
              type="datetime-local"
              className="input"
              value={toLocalInputValue(d.dueAt)}
              onChange={(e) => set("dueAt", fromLocalInputValue(e.target.value))}
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              {d.dueAt ? formatDue(d.dueAt) : "No deadline detected — set one if you have it."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Priority</label>
            <div className="flex gap-2">
              {(["low", "normal", "high"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("priority", p)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-medium capitalize transition ${
                    d.priority === p
                      ? "border-vx-500/60 bg-vx-500/15 text-vx-200"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Estimated minutes</label>
            <input
              type="number"
              min={5}
              max={1440}
              step={5}
              className="input"
              value={d.estimateMins ?? ""}
              placeholder="e.g. 45"
              onChange={(e) => set("estimateMins", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>

        {d.aiNotes && !d.degraded && (
          <p className="text-xs leading-relaxed text-slate-500">
            <span className="text-slate-400">Note from the AI:</span> {d.aiNotes}
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-2.5">
        <button className="btn-primary flex-1 py-3" disabled={saving || !d.title.trim()} onClick={() => onSave(d)}>
          {saving ? "Saving…" : "Save homework"}
          {!saving && (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <button className="btn-ghost px-6" disabled={saving} onClick={onDiscard}>
          Discard
        </button>
      </div>
      </div>
    </div>
  );
}

/** Slim confidence meter — greys out below 50%, so low-trust parses read as low-trust. */
function ConfidenceMeter({ pct }: { pct: number }) {
  const tone = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <span className="inline-flex items-center gap-1.5" title={`${pct}% confident`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.span
          className="block h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
          style={{ background: `linear-gradient(90deg, ${tone}, ${tone}99)` }}
        />
      </span>
      <span className="text-[11px] tabular-nums text-slate-500">{pct}%</span>
    </span>
  );
}
