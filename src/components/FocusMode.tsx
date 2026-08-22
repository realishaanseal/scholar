"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeworkDTO } from "@/lib/clientTypes";
import { formatDue } from "@/lib/format";

/**
 * Focused single-task workspace.
 *
 * The timer is the point: it turns an estimate into a measured actual, which is
 * the only thing that lets future estimates get better. Elapsed time is derived
 * from wall-clock timestamps rather than counting interval ticks, so a
 * backgrounded tab (where browsers throttle timers) still records real time.
 */
export default function FocusMode({
  hw,
  onExit,
  onUpdate,
}: {
  hw: HomeworkDTO;
  onExit: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const baseSeconds = hw.focusSeconds ?? 0;
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(baseSeconds);
  const [notes, setNotes] = useState(hw.details ?? "");
  const [saving, setSaving] = useState(false);

  const runStartRef = useRef<number | null>(Date.now());
  const accumulatedRef = useRef(baseSeconds);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const since = runStartRef.current ? (Date.now() - runStartRef.current) / 1000 : 0;
      setElapsed(accumulatedRef.current + since);
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  function toggle() {
    if (running) {
      const since = runStartRef.current ? (Date.now() - runStartRef.current) / 1000 : 0;
      accumulatedRef.current += since;
      runStartRef.current = null;
      setElapsed(accumulatedRef.current);
      setRunning(false);
    } else {
      runStartRef.current = Date.now();
      setRunning(true);
    }
  }

  function currentSeconds(): number {
    const since = running && runStartRef.current ? (Date.now() - runStartRef.current) / 1000 : 0;
    return Math.round(accumulatedRef.current + since);
  }

  async function persist(extra: Record<string, unknown> = {}) {
    setSaving(true);
    await onUpdate(hw.id, {
      focusSeconds: currentSeconds(),
      details: notes,
      ...extra,
    });
    setSaving(false);
  }

  async function pauseAndExit() {
    await persist({ status: hw.status === "todo" ? "doing" : hw.status });
    onExit();
  }

  async function complete() {
    const mins = Math.max(1, Math.round(currentSeconds() / 60));
    await persist({ status: "done", actualMins: mins });
    onExit();
  }

  // Save progress if the student closes the tab mid-session — otherwise the
  // measured time is lost and academic memory learns nothing from the session.
  useEffect(() => {
    function handleUnload() {
      navigator.sendBeacon?.(
        `/api/homework/${hw.id}`,
        new Blob([JSON.stringify({ focusSeconds: currentSeconds() })], { type: "application/json" })
      );
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.id]);

  const estimateSec = (hw.estimateMins ?? 0) * 60;
  const progress = estimateSec > 0 ? Math.min(1, elapsed / estimateSec) : 0;
  const over = estimateSec > 0 && elapsed > estimateSec;
  const color = hw.subject?.color ?? "#5b7cfa";

  return (
    <div className="card animate-riseIn overflow-hidden p-6 xl:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
              {hw.subject?.name ?? "General"}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{hw.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{formatDue(hw.dueAt)}</p>
        </div>

        <button onClick={pauseAndExit} className="btn-ghost px-4 py-2 text-xs" disabled={saving}>
          Save &amp; close
        </button>
      </div>

      {/* Timer */}
      <div className="mt-7 flex flex-col items-center">
        <div
          className="text-6xl font-semibold tabular-nums tracking-tight"
          style={{ color: over ? "#fbbf24" : "#fff" }}
        >
          {formatClock(elapsed)}
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {hw.estimateMins
            ? over
              ? `${formatClock(elapsed - estimateSec)} over the ${hw.estimateMins}m estimate`
              : `of about ${hw.estimateMins}m estimated`
            : "No estimate set"}
        </p>

        {hw.estimateMins ? (
          <div className="mt-4 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(2, progress * 100)}%`,
                background: over ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "var(--grad-brand)",
              }}
            />
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button onClick={toggle} className={running ? "btn-ghost px-6 py-2.5" : "btn-primary px-6 py-2.5"}>
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={complete} className="btn-primary px-6 py-2.5" disabled={saving}>
            Mark complete
          </button>
        </div>
      </div>

      {/* Working notes — saved into the task's details. */}
      <div className="mt-7">
        <label className="label">Working notes</label>
        <textarea
          className="input min-h-[120px] resize-y text-[13.5px] leading-relaxed"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Questions attempted, where you got stuck, what's left…"
        />
      </div>

      <p className="mt-3 text-[11px] text-slate-600">
        Time is recorded when you finish, and used to make future estimates for{" "}
        {hw.subject?.name ?? "this subject"} more accurate.
      </p>
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
