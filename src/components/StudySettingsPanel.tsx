"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type Availability = {
  weekdayMins: number;
  weekendMins: number;
  studyStartHour: number;
  studyEndHour: number;
};

type Memory = {
  totalEvents: number;
  overallOnTimeRate: number;
  overallCalibration: number;
  subjects: Array<{
    subject: string;
    calibration: number;
    averageActualMins: number;
    onTimeRate: number;
    sampleSize: number;
  }>;
};

/**
 * Study time and academic memory.
 *
 * These numbers drive every risk score in the app, so the panel states plainly
 * what each one changes — a student who doesn't understand why a task is marked
 * "critical" should be able to come here and see the assumption behind it.
 */
export default function StudySettingsPanel() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function load() {
    const { data } = await fetchJson<{ availability: Availability; memory: Memory }>("/api/settings/study");
    if (data) {
      setAvailability(data.availability);
      setMemory(data.memory);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(patch: Partial<Availability>) {
    if (!availability) return;
    const next = { ...availability, ...patch };
    setAvailability(next);
    setSaving(true);
    const { ok, data, error } = await fetchJson<{ availability: Availability }>("/api/settings/study", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (ok && data) {
      // The server clamps invalid windows, so adopt what it actually stored.
      setAvailability(data.availability);
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1800);
    } else {
      setStatus(error ?? "Couldn't save");
    }
  }

  async function reset() {
    const { ok, data } = await fetchJson<{ removed: number }>("/api/settings/study", { method: "DELETE" });
    setConfirmReset(false);
    if (ok) {
      setStatus(`Cleared ${data?.removed ?? 0} recorded session${data?.removed === 1 ? "" : "s"}`);
      setTimeout(() => setStatus(null), 2600);
      load();
    }
  }

  if (!availability) return <div className="card skeleton-shimmer h-[320px]" />;

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Study time</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Used to work out whether a deadline is actually reachable.
            </p>
          </div>
          {status && <span className="shrink-0 text-[11px] text-emerald-300">{status}</span>}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Slider
            label="On a weekday"
            value={availability.weekdayMins}
            min={0} max={480} step={15}
            format={formatMins}
            onCommit={(v) => save({ weekdayMins: v })}
          />
          <Slider
            label="On a weekend day"
            value={availability.weekendMins}
            min={0} max={720} step={15}
            format={formatMins}
            onCommit={(v) => save({ weekendMins: v })}
          />
        </div>

        <div className="mt-6">
          <label className="label">Study hours</label>
          <div className="mt-1 flex items-center gap-2.5">
            <HourSelect
              value={availability.studyStartHour}
              onChange={(v) => save({ studyStartHour: v })}
            />
            <span className="text-xs text-slate-500">to</span>
            <HourSelect
              value={availability.studyEndHour}
              onChange={(v) => save({ studyEndHour: v })}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Nothing is scheduled outside this window.
          </p>
        </div>
      </section>

      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">What Scholar has learned</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Built from tasks finished with the focus timer.
        </p>

        {!memory || memory.totalEvents === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center text-xs text-slate-500">
            Nothing learned yet. Finish a task with the focus timer.
          </p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Stat label="Sessions" value={String(memory.totalEvents)} />
              <Stat label="On time" value={`${Math.round(memory.overallOnTimeRate * 100)}%`} />
              <Stat
                label="Est. accuracy"
                value={calibrationLabel(memory.overallCalibration)}
              />
            </div>

            <div className="mt-5 space-y-2">
              {memory.subjects.map((s) => (
                <div
                  key={s.subject}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
                >
                  <span className="text-[13px] font-medium text-slate-200">{s.subject}</span>
                  <span className="text-[11px] text-slate-500">
                    avg {formatMins(s.averageActualMins)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {Math.round(s.onTimeRate * 100)}% on time
                  </span>
                  <span className="ml-auto text-[11px] text-slate-600">
                    {s.sampleSize} session{s.sampleSize === 1 ? "" : "s"}
                    {s.sampleSize < 5 && " · still learning"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-white/[0.06] pt-5">
              {confirmReset ? (
                <>
                  <span className="text-xs text-slate-400">
                    Delete everything Scholar has learned? Estimates go back to raw values.
                  </span>
                  <button type="button" className="btn-danger ml-auto px-3 py-2 text-xs" onClick={reset}>
                    Yes, reset
                  </button>
                  <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[11px] text-slate-600">
                    This data never leaves your device.
                  </span>
                  <button
      type="button"
      className="btn-ghost ml-auto px-3 py-2 text-xs"
                    onClick={() => setConfirmReset(true)}
                  >
                    Reset memory
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Slider({
  label, value, min, max, step, format, onCommit,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (n: number) => string; onCommit: (n: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label">{label}</label>
        <span className="text-[13px] font-medium tabular-nums text-white">{format(local)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        // Commit on release rather than on every frame — otherwise dragging
        // fires a write per pixel.
        onMouseUp={() => onCommit(local)}
        onTouchEnd={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="mt-2 w-full accent-vx-400"
      />
    </div>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="input w-auto py-2 text-[13px]" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 25 }, (_, h) => (
        <option key={h} value={h}>{formatHour(h)}</option>
      ))}
    </select>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-center">
      <div className="text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

function formatMins(m: number): string {
  if (m === 0) return "None";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  if (h === 24) return "Midnight";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** Turn a raw calibration factor into something a student can act on. */
function calibrationLabel(c: number): string {
  if (c >= 1.25) return `+${Math.round((c - 1) * 100)}%`;
  if (c <= 0.8) return `${Math.round((c - 1) * 100)}%`;
  return "Accurate";
}
