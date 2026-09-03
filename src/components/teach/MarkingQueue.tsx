"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT } from "@/components/motion";
import { cn } from "@/lib/cn";
import type { PendingSubmission } from "@/domains/assessment";

/** Mirrors GradeDraft, minus the fields the marking screen has no use for. */
type Draft = {
  id: string;
  model: string;
  suggestedScore: number | null;
  suggestedFeedback: string;
  rationale: string;
  confidence: number | null;
};

/**
 * Everything waiting on this teacher, oldest first.
 *
 * Marking is the job, so it gets a page rather than a tab inside a class — the
 * work spans sections and a teacher does not think "let me mark 10B now", they
 * think "let me clear the backlog". Oldest first because the person who has
 * been waiting longest should not keep waiting.
 *
 * Each item is graded in place. Opening a separate screen per submission and
 * returning to a list that has shifted underneath is how marking thirty papers
 * becomes an hour instead of ten minutes.
 */
export default function MarkingQueue({ initial }: { initial: PendingSubmission[] }) {
  const [queue, setQueue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submitGrade(
    item: PendingSubmission,
    score: string,
    feedback: string,
    draftId: string | null
  ) {
    setError(null);
    const res = await fetch(`/api/institution/submissions/${item.id}/grade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        score: score.trim() === "" ? null : Number(score),
        feedback,
        // Sent only so the audit trail can record that a model was consulted
        // and whether this teacher agreed with it. The score above is the
        // teacher's, whatever the suggestion said.
        draftId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not save that mark.");
      return false;
    }
    // Leaves the queue as soon as it is marked, so what remains is what is
    // still owed.
    setQueue((q) => q.filter((x) => x.id !== item.id));
    return true;
  }

  if (queue.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-slate-200">Nothing waiting</p>
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
          Every submission in your classes has been marked and returned.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-[13px] text-amber-200"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {queue.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.26, ease: EASE_OUT }}
            >
              <MarkingCard item={item} onGrade={submitGrade} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MarkingCard({
  item,
  onGrade,
}: {
  item: PendingSubmission;
  onGrade: (
    i: PendingSubmission,
    score: string,
    feedback: string,
    draftId: string | null
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  async function suggest() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/institution/submissions/${item.id}/draft`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not draft a mark.");
      setDraft(data.draft);
    } catch (err) {
      setDraftError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="card overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3.5 px-4 py-3 text-start transition-colors hover:bg-white/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-slate-100">
            {item.assignmentTitle}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
            {item.courseCode} · {item.sectionName}
            {item.submittedAt && ` · ${relative(item.submittedAt)}`}
            {item.attempt > 1 && ` · attempt ${item.attempt}`}
          </p>
        </div>

        {item.isLate && (
          <span className="shrink-0 rounded-full bg-amber-400/[0.12] px-2 py-0.5 text-[11px] text-amber-300">
            Late
          </span>
        )}
        {item.points !== null && (
          <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500">
            / {item.points}
          </span>
        )}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
          className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="space-y-3.5 px-4 py-3.5">
              {item.body ? (
                <p className="whitespace-pre-wrap rounded-lg bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-slate-300">
                  {item.body}
                </p>
              ) : (
                <p className="text-[12.5px] italic text-slate-500">No written answer.</p>
              )}

              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block text-[12.5px] text-vx-300 hover:text-vx-200"
                >
                  Open submitted link ↗
                </a>
              )}

              {/* The suggestion sits beside the fields and never inside them.
                  Pre-filling would make "Return" an acceptance by default, and
                  a mark nobody read is exactly what this feature must not
                  quietly produce. Using it takes a deliberate click. */}
              {draft ? (
                <div className="rounded-lg border border-vx-400/25 bg-vx-400/[0.06] px-3.5 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-vx-300">
                      Suggested by {draft.model}
                    </span>
                    {draft.confidence !== null && (
                      <span className="text-[11px] text-slate-500">
                        {Math.round(draft.confidence * 100)}% confident
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500">
                      · not recorded until you return it
                    </span>
                  </div>

                  <p className="text-[13px] text-slate-200">
                    {draft.suggestedScore === null ? (
                      <span className="text-slate-400">No score suggested.</span>
                    ) : (
                      <span className="font-semibold tabular-nums">
                        {draft.suggestedScore}
                        {item.points !== null && ` / ${item.points}`}
                      </span>
                    )}
                  </p>

                  {draft.suggestedFeedback && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-300">
                      {draft.suggestedFeedback}
                    </p>
                  )}

                  {draft.rationale && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11.5px] text-slate-500 hover:text-slate-400">
                        Why it says that
                      </summary>
                      {/* Written to the teacher about the student. Never sent
                          on, and never copied into feedback automatically. */}
                      <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-400">
                        {draft.rationale}
                      </p>
                    </details>
                  )}

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScore(
                          draft.suggestedScore === null ? "" : String(draft.suggestedScore)
                        );
                        setFeedback(draft.suggestedFeedback);
                      }}
                      className="btn btn-ghost px-2.5 py-1 text-[12px]"
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="btn btn-ghost px-2.5 py-1 text-[12px] text-slate-500"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void suggest()}
                    disabled={drafting}
                    className="btn btn-ghost px-3 py-1.5 text-[12.5px]"
                  >
                    {drafting ? "Reading the work…" : "Suggest a mark"}
                  </button>
                  {draftError && (
                    <span className="text-[12px] text-rose-300">{draftError}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] text-slate-400">
                    Mark {item.points !== null && `(out of ${item.points})`}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={item.points ?? undefined}
                    step="0.5"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="input w-[110px]"
                    placeholder="—"
                  />
                </label>
                <label className="block min-w-[200px] flex-1">
                  <span className="mb-1 block text-[11.5px] text-slate-400">Feedback</span>
                  <input
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="input w-full"
                    placeholder="Optional"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    await onGrade(item, score, feedback, draft?.id ?? null);
                    setSaving(false);
                  }}
                  className="btn-primary px-3.5 py-2 text-[13px]"
                >
                  {saving ? "Saving…" : "Return"}
                </button>
              </div>

              {/* A mark can be withheld deliberately; formative work often
                  wants comments and no number. */}
              <p className="text-[11.5px] text-slate-500">
                Leave the mark empty to return feedback without a score.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
