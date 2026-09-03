"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fetchJson } from "@/lib/fetchJson";
import { DAYS, meta as kindMeta, pad, type ClassSlot } from "@/lib/scholar/timetableView";

/* Re-exported so the many importers of `ClassList`'s slot type keep working
   now that the shape lives alongside the rest of the timetable helpers. */
export type { ClassSlot };

/**
 * The list of classes already in the timetable, with per-row edit and
 * delete. This is the only way to fix a single class now that the manual
 * "add a class" form is gone — a wrong room or teacher name doesn't need a
 * whole re-import, just a tap on the row.
 *
 * Shared between Settings → Preferences and the "Classes" live view so
 * there's exactly one edit implementation to keep correct.
 */
export default function ClassList({
  classes,
  onChanged,
  emptyHint = "No classes yet — import a timetable above.",
}: {
  classes: ClassSlot[];
  onChanged: () => void;
  emptyHint?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (classes.length === 0) {
    return <p className="mt-3 text-xs text-slate-500">{emptyHint}</p>;
  }

  async function clearAll() {
    setClearing(true);
    await fetchJson("/api/timetable?all=true", { method: "DELETE" });
    setClearing(false);
    setConfirmingClear(false);
    onChanged();
  }

  return (
    <div className="mt-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2 pb-0.5">
        <span className="text-[11px] text-slate-500">
          {classes.length} {classes.length === 1 ? "class" : "classes"}
        </span>

        {confirmingClear ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-300">Clear all? Can&apos;t be undone.</span>
            <button
              type="button"
              onClick={clearAll}
              disabled={clearing}
              className="chip-btn border border-red-500/30 bg-red-500/10 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              {clearing ? "Clearing…" : "Yes, clear all"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              disabled={clearing}
              className="chip-btn border border-white/[0.08] bg-white/[0.025] text-[11px] text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="chip-btn border border-white/[0.08] bg-white/[0.025] text-[11px] text-slate-500 hover:border-red-500/25 hover:text-red-300"
          >
            Clear all
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
      {classes.map((c, i) =>
        editing === c.id ? (
          <EditRow
            key={c.id}
            slot={c}
            onDone={() => { setEditing(null); onChanged(); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 15) * 0.02 } }}
            exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          >
            <span className="w-20 shrink-0 text-[11px] text-slate-500">{DAYS[c.dayOfWeek].slice(0, 3)}</span>
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-slate-500">
              {pad(c.startHour)}:{pad(c.startMin)}–{pad(c.endHour)}:{pad(c.endMin)}
            </span>
            {c.kind !== "class" && (
              <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${kindMeta(c.kind).dot}`} title={kindMeta(c.kind).label} />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
              {c.title}
              {c.teacherName && <span className="ml-1.5 text-slate-500">· {c.teacherName}</span>}
              {c.location && <span className="ml-1.5 text-slate-600">· {c.location}</span>}
            </span>
            <button
      type="button"
      onClick={() => setEditing(c.id)}
              className="tap-44 shrink-0 text-slate-600 hover:text-slate-300"
              aria-label="Edit"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button
      type="button"
      onClick={async () => {
                await fetchJson(`/api/timetable?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
                onChanged();
              }}
              className="tap-44 shrink-0 text-slate-600 hover:text-red-300"
              aria-label="Remove"
            >
              ✕
            </button>
          </motion.div>
        )
      )}
      </AnimatePresence>
    </div>
  );
}

function EditRow({
  slot, onDone, onCancel,
}: {
  slot: ClassSlot;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: slot.title,
    teacherName: slot.teacherName ?? "",
    location: slot.location ?? "",
    dayOfWeek: slot.dayOfWeek,
    startHour: slot.startHour,
    startMin: slot.startMin,
    endHour: slot.endHour,
    endMin: slot.endMin,
    kind: slot.kind ?? "class",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const { ok, error } = await fetchJson("/api/timetable", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: slot.id,
        title: form.title.trim(),
        teacherName: form.teacherName.trim() || null,
        location: form.location.trim() || null,
        dayOfWeek: form.dayOfWeek,
        startHour: form.startHour,
        startMin: form.startMin,
        endHour: form.endHour,
        endMin: form.endMin,
        kind: form.kind,
      }),
    });
    setBusy(false);
    if (ok) onDone();
    else setError(error ?? "Couldn't save that.");
  }

  return (
    <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="input py-2 text-[13px]"
          placeholder="Class name"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          className="input py-2 text-[13px]"
          placeholder="Teacher (optional)"
          value={form.teacherName}
          onChange={(e) => setForm({ ...form, teacherName: e.target.value })}
        />
        <input
          className="input py-2 text-[13px]"
          placeholder="Room / location (optional)"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <select
          className="input py-2 text-[13px]"
          value={form.dayOfWeek}
          onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
        >
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <select
          className="input py-2 text-[13px]"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as "class" | "break" | "library" })}
        >
          <option value="class">Class</option>
          <option value="break">Break</option>
          <option value="library">Library</option>
        </select>
        <div className="flex items-center gap-1.5">
          <select
            className="input w-full py-2 text-[13px]"
            value={form.startHour}
            onChange={(e) => setForm({ ...form, startHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:{pad(form.startMin)}</option>)}
          </select>
          <span className="shrink-0 text-slate-600">–</span>
          <select
            className="input w-full py-2 text-[13px]"
            value={form.endHour}
            onChange={(e) => setForm({ ...form, endHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:{pad(form.endMin)}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      <div className="mt-2.5 flex gap-2">
        <button
      type="button"
      className="btn-primary px-4 py-1.5 text-xs"
          onClick={save}
          disabled={busy || form.title.trim().length < 1}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
