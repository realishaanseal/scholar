"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import type { HomeworkDTO } from "@/lib/clientTypes";
import type { TaskRiskDTO } from "./NowCard";
import {
  formatDue, urgencyOf, URGENCY_STYLES, PRIORITY_STYLES,
  toLocalInputValue, fromLocalInputValue,
} from "@/lib/format";

const RISK_ACCENT: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  moderate: "#f59e0b",
  low: "#10b981",
  none: "#64748b",
};

export default function HomeworkItem({
  hw,
  knownSubjects,
  risk,
  onFocus,
  onUpdate,
  onDelete,
}: {
  hw: HomeworkDTO;
  knownSubjects: string[];
  risk?: TaskRiskDTO | null;
  onFocus?: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editCardRef = useRef<HTMLDivElement>(null);

  // The edit form is taller than the collapsed card, so opening it can push
  // its bottom (and the Save/Cancel/Delete row) below the fold — the browser
  // doesn't scroll for you just because content grew in place. `block:
  // "nearest"` scrolls the minimum needed to bring the whole card back into
  // view rather than always snapping it to one edge. This card sits directly
  // in the page's normal flow (no nested scroll container around the list),
  // so scrollIntoView here only ever moves the page itself — unlike a chat
  // panel with its own internal scrollbar, there's no ancestor it could
  // wrongly bubble through instead.
  useEffect(() => {
    if (editing) editCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [editing]);
  const [draft, setDraft] = useState({
    title: hw.title,
    details: hw.details,
    subject: hw.subject?.name ?? "General",
    dueAt: hw.dueAt,
    priority: hw.priority,
    estimateMins: hw.estimateMins,
  });

  const done = hw.status === "done";
  const urgency = done ? "none" : urgencyOf(hw.dueAt);
  const style = URGENCY_STYLES[urgency];
  const color = hw.subject?.color ?? "#5b7cfa";

  async function save() {
    await onUpdate(hw.id, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <motion.div
        ref={editCardRef}
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
        className="card-aurora"
      >
        <div className="p-5">
          <div className="space-y-3.5">
            <div>
              <label className="label">Task</label>
              <input className="input" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Details</label>
              <textarea className="input min-h-[76px] resize-y" placeholder="Pages, questions, format…"
                value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="label">Subject</label>
                <input className="input" list="known-subjects-list" value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                <datalist id="known-subjects-list">
                  {knownSubjects.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Due</label>
                <input type="datetime-local" className="input" value={toLocalInputValue(draft.dueAt)}
                  onChange={(e) => setDraft({ ...draft, dueAt: fromLocalInputValue(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="label">Priority</label>
                <div className="flex gap-2">
                  {(["low", "normal", "high"] as const).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setDraft({ ...draft, priority: p })}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-medium capitalize transition-all duration-200 ${
                        draft.priority === p
                          ? "border-vx-500/60 bg-vx-500/[0.16] text-vx-200"
                          : "border-white/[0.09] bg-white/[0.025] text-slate-400 hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Estimated minutes</label>
                <input type="number" min={5} max={1440} step={5} className="input" placeholder="e.g. 45"
                  value={draft.estimateMins ?? ""}
                  onChange={(e) => setDraft({ ...draft, estimateMins: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-5" onClick={save}>Save changes</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>

            <AnimatePresence mode="wait" initial={false}>
              {confirmDelete ? (
                <motion.span
                  key="confirm"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="ml-auto flex items-center gap-2"
                >
                  <span className="text-xs text-slate-400">Delete this?</span>
                  <button type="button" className="btn-danger px-3 py-2" onClick={() => onDelete(hw.id)}>Yes, delete</button>
                  <button type="button" className="btn-ghost px-3 py-2" onClick={() => setConfirmDelete(false)}>No</button>
                </motion.span>
              ) : (
                <motion.button
                  key="delete"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="btn-danger ml-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`card card-hover group relative overflow-hidden p-4 xl:p-[18px] ${style.ring} ${
        urgency === "overdue" ? "urgent-halo" : ""
      }`}
      whileHover={{ y: -2 }}
      transition={SPRING}
    >
      {/* subject colour spine */}
      <span
        className="absolute inset-y-0 left-0 w-[3px] transition-all duration-300 group-hover:w-[4px]"
        style={{
          background: `linear-gradient(180deg, ${color}, ${color}22)`,
          boxShadow: `0 0 18px ${color}55`,
        }}
        aria-hidden
      />

      <div className="flex items-start gap-3.5 pl-2">
        <motion.button
          onClick={() => onUpdate(hw.id, { status: done ? "todo" : "done" })}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          transition={SPRING}
          className={`tap-44 mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg border ${
            done
              ? "border-emerald-500/60 bg-emerald-500/25 text-emerald-300"
              : "border-white/20 hover:border-vx-400 hover:bg-vx-500/10"
          }`}
        >
          <AnimatePresence>
            {done && (
              <motion.svg
                key="check"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={SPRING}
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.05 }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="chip border"
              style={{ background: `${color}18`, color, borderColor: `${color}33` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
              {hw.subject?.name ?? "General"}
            </span>

            <span className={`chip border ${style.bg} ${style.text} ${style.ring}`}>
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              {formatDue(hw.dueAt)}
            </span>

            {/* Set only on tasks projected from coursework. Until now such a
                task announced its course and then went nowhere; this is the
                way back to the brief, the attachments and handing it in. */}
            {hw.courseLink && (
              <Link
                href={`/learn/${hw.courseLink.sectionId}`}
                onClick={(e) => e.stopPropagation()}
                className="chip border border-white/[0.1] text-slate-400 transition-colors hover:border-white/[0.2] hover:text-slate-200"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Open in {hw.courseLink.courseCode}
              </Link>
            )}

            {hw.priority === "high" && !done && (
              <span className={`chip ${PRIORITY_STYLES.high}`}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M12 2l2.6 7.4H22l-6 4.6 2.3 7.4-6.3-4.7L5.7 21.4 8 14 2 9.4h7.4z" /></svg>
                High
              </span>
            )}

            {/* Risk badge — only shown when it adds information beyond the due date. */}
            {!done && risk && (risk.level === "critical" || risk.level === "high") && (
              <span
                className="chip border"
                style={{
                  background: `${RISK_ACCENT[risk.level]}1a`,
                  color: RISK_ACCENT[risk.level],
                  borderColor: `${RISK_ACCENT[risk.level]}33`,
                }}
                title={risk.reason}
              >
                {risk.level === "critical" ? "Critical" : "At risk"}
              </span>
            )}

            {hw.estimateMins && (
              <span className="text-[11px] text-slate-500">
                ~{hw.estimateMins} min
                {risk && risk.remainingMins !== hw.estimateMins && !done
                  ? ` · ${risk.remainingMins}m left`
                  : ""}
              </span>
            )}

            {hw.source === "voice" && (
              <span className="text-[11px] text-slate-600" title="Captured by voice">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </span>
            )}
          </div>

          <h3 className={`mt-2 text-[15px] font-medium leading-snug transition-colors ${
            done ? "text-slate-500 line-through" : "text-white"
          }`}>
            {hw.title}
          </h3>

          {hw.details && (
            <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-400 ${expanded ? "" : "line-clamp-2"}`}>
              {hw.details}
            </p>
          )}

          {hw.details && hw.details.length > 120 && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1.5 text-xs text-slate-500 transition-colors hover:text-vx-300">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}

          {/* Why this is urgent — stated, not just colour-coded. */}
          {!done && risk && (risk.level === "critical" || risk.level === "high") && (
            <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: `${RISK_ACCENT[risk.level]}cc` }}>
              {risk.reason}
            </p>
          )}

          {done && hw.actualMins ? (
            <p className="mt-2 text-[11px] text-slate-600">
              Took {hw.actualMins}m
              {hw.estimateMins ? ` · estimated ${hw.estimateMins}m` : ""}
            </p>
          ) : null}
        </div>

        {!done && onFocus && (
          <button
      type="button"
      onClick={onFocus}
            className="tap-44 shrink-0 rounded-lg p-2 text-slate-500 opacity-0 transition-all duration-200
                       hover:bg-white/[0.07] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            aria-label="Start focus session"
            title="Start focus session"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M10 8.5l6 3.5-6 3.5z" />
            </svg>
          </button>
        )}

        <button
      type="button"
      onClick={() => setEditing(true)}
          className="tap-44 shrink-0 rounded-lg p-2 text-slate-500 opacity-0 transition-all duration-200
                     hover:bg-white/[0.07] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
          aria-label="Edit"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
