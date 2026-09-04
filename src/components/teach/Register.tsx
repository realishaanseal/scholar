"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Taking the register.
 *
 * Built around the one minute a form tutor has. Everybody opens as present,
 * because in almost every class almost everybody is — the teacher is about to
 * change the two or three that differ, and starting from blank would mean
 * thirty clicks to record a normal morning.
 *
 * Four states, and 'excused' is deliberately distinct from 'absent'. An
 * authorised absence is not a mark against anybody, and a register that
 * collapses them is a register that quietly becomes unfair to the child with
 * hospital appointments.
 *
 * Saved as one act rather than per row, because that is what taking a
 * register is, and because a half-saved register is a legal document with a
 * hole in it.
 */

type State = "present" | "absent" | "late" | "excused";

type Mark = {
  userId: string;
  name: string | null;
  email: string | null;
  state: State;
  minutesLate: number | null;
  note: string;
};

const STATES: Array<{ id: State; label: string; short: string }> = [
  { id: "present", label: "Present", short: "P" },
  { id: "late", label: "Late", short: "L" },
  { id: "absent", label: "Absent", short: "A" },
  { id: "excused", label: "Excused", short: "E" },
];

const STYLES: Record<State, string> = {
  present: "border-emerald-400/40 bg-emerald-400/[0.12] text-emerald-200",
  late: "border-amber-400/40 bg-amber-400/[0.12] text-amber-200",
  absent: "border-rose-400/40 bg-rose-400/[0.12] text-rose-200",
  excused: "border-sky-400/40 bg-sky-400/[0.12] text-sky-200",
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Register({ sectionId }: { sectionId: string }) {
  const [date, setDate] = useState(today());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState<string | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/institution/sections/${sectionId}/attendance?date=${date}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(data.register?.sessionId ?? null);
      setTakenAt(data.register?.takenAt ?? null);
      setMarks(data.register?.marks ?? []);
    } catch {
      // A register that will not load is better as an empty screen than as an
      // error the teacher cannot act on.
    } finally {
      setLoading(false);
    }
  }, [sectionId, date]);

  useEffect(() => { void load(); }, [load]);

  function set(userId: string, state: State) {
    setMarks((prev) => prev.map((m) => (m.userId === userId ? { ...m, state } : m)));
  }

  async function save() {
    if (!sessionId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/institution/sections/${sectionId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          marks: marks.map((m) => ({
            userId: m.userId,
            state: m.state,
            minutesLate: m.minutesLate,
            note: m.note,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the register.");

      setMessage(
        data.corrected > 0
          ? `Saved. ${data.corrected} ${data.corrected === 1 ? "mark was" : "marks were"} changed — the correction is recorded.`
          : "Saved."
      );
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const counts = STATES.map((s) => ({
    ...s,
    n: marks.filter((m) => m.state === s.id).length,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-slate-400">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </label>
        <p className="pb-2 text-[12.5px] text-slate-500">
          {takenAt
            ? `Taken ${new Date(takenAt).toLocaleString(undefined, {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}`
            : "Not taken yet"}
        </p>
      </div>

      {loading ? (
        <div className="skeleton-shimmer h-40 rounded-xl" />
      ) : marks.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nobody is enrolled</p>
          <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
            A register needs a class. Add students to this section first.
          </p>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-white/[0.05] rounded-xl">
            {marks.map((m) => (
              <div
                key={m.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                  {m.name ?? m.email ?? m.userId.slice(0, 8)}
                </span>
                <div className="flex gap-1">
                  {STATES.map((s) => {
                    const on = m.state === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${m.name ?? m.email ?? "Student"}: ${s.label}`}
                        onClick={() => set(m.userId, s.id)}
                        className={
                          on
                            ? `grid h-8 w-8 place-items-center rounded-md border text-[12px] font-semibold ${STYLES[s.id]}`
                            : "grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] text-[12px] text-slate-500 hover:border-white/20"
                        }
                        title={s.label}
                      >
                        {s.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary px-4 py-2 text-[13px]"
            >
              {saving ? "Saving…" : takenAt ? "Save changes" : "Take the register"}
            </button>
            <p className="text-[12.5px] tabular-nums text-slate-500">
              {counts.filter((c) => c.n > 0).map((c) => `${c.n} ${c.label.toLowerCase()}`).join(" · ")}
            </p>
            {message && <span className="text-[12.5px] text-slate-300">{message}</span>}
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
            Excused is not counted against a student. Changing a mark after the register
            has been taken is recorded, because this is a legal record.
          </p>
        </>
      )}
    </div>
  );
}
