"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT } from "@/components/motion";
import { cn } from "@/lib/cn";
import type { PendingSubmission } from "@/domains/assessment";

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

  async function submitGrade(item: PendingSubmission, score: string, feedback: string) {
    setError(null);
    const res = await fetch(`/api/institution/submissions/${item.id}/grade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        score: score.trim() === "" ? null : Number(score),
        feedback,
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
  onGrade: (i: PendingSubmission, score: string, feedback: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

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
                    await onGrade(item, score, feedback);
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
