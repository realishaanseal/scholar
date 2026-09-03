"use client";

import { useMemo, useState } from "react";
import { deadlineView } from "@/lib/time";
import { displayGrade, higherIsBetter, SCHEMES, scheme } from "@/domains/grading/schemes";

/**
 * Where the institution is, and which days it does not work.
 *
 * Two settings that look like preferences and are not. The zone decides what
 * every deadline in the institution means; the rest days decide which days
 * Scholar tells students they are free to work. Both were assumptions until
 * now — UTC and Saturday–Sunday — and both were wrong for a large part of the
 * world in a way nothing surfaced.
 *
 * The preview is the point of the screen. A dropdown of IANA names is
 * meaningless to most people; the same choice shown as "a deadline set for
 * Friday 23:59 means this" is checkable by anyone.
 */

const DAYS = [
  { n: 0, label: "Sunday" },
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
  { n: 6, label: "Saturday" },
];

/** Common patterns, so the usual answer is one click rather than seven. */
const PRESETS = [
  { label: "Sat – Sun", days: [0, 6] },
  { label: "Fri – Sat", days: [5, 6] },
  { label: "Sunday only", days: [0] },
  { label: "Friday only", days: [5] },
];

function allZones(): string[] {
  try {
    // Every zone the runtime knows, which is the whole IANA database on any
    // current browser. Falling back to a short list rather than an empty one:
    // a picker with nothing in it is worse than a picker with the common
    // answers in it.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === "function") return fn("timeZone");
  } catch {
    /* fall through */
  }
  return [
    "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
    "Europe/London", "Europe/Berlin", "Europe/Madrid", "Africa/Cairo",
    "America/New_York", "America/Chicago", "America/Los_Angeles",
    "America/Sao_Paulo", "Australia/Sydney",
  ];
}

export default function TimeSettings({
  initialTimezone,
  initialRestDays,
  initialScheme,
  initialAiPolicy,
}: {
  initialTimezone: string;
  initialRestDays: number[];
  initialScheme: string;
  initialAiPolicy: "off" | "institution" | "teacher";
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [restDays, setRestDays] = useState<number[]>(initialRestDays);
  const [gradingScheme, setGradingScheme] = useState(initialScheme);
  const [aiPolicy, setAiPolicy] = useState(initialAiPolicy);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const zones = useMemo(allZones, []);
  const viewerZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  // A concrete Friday 23:59 in the chosen zone, shown as the school would say
  // it and as this administrator's own clock says it.
  const preview = useMemo(() => {
    const sample = new Date("2026-09-11T18:29:00.000Z");
    return deadlineView(sample, timezone, viewerZone);
  }, [timezone, viewerZone]);

  function toggle(day: number) {
    setRestDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/institution/settings/time", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone, restDays, gradingScheme, aiPolicy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setMessage({ ok: true, text: "Saved. New deadlines will use this clock." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 text-[13.5px] font-medium text-slate-200">Timezone</h2>
        <p className="mb-2.5 max-w-[54ch] text-[12.5px] leading-relaxed text-slate-400">
          The clock your teachers write deadlines against. A student reading a deadline
          from another country sees their own time alongside this one, so the rule stays
          the rule wherever they are.
        </p>

        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="input w-full max-w-[380px]"
        >
          {zones.map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
          ))}
        </select>

        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <p className="text-[11.5px] uppercase tracking-wide text-slate-500">
            A deadline set for Friday 23:59 means
          </p>
          <p className="mt-1 text-[13px] text-slate-200">
            {preview.institution.text} {preview.institution.abbrev}
          </p>
          {preview.differs && (
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              {preview.viewer.text} {preview.viewer.abbrev} — where you are now
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13.5px] font-medium text-slate-200">Days off</h2>
        <p className="mb-2.5 max-w-[54ch] text-[12.5px] leading-relaxed text-slate-400">
          Which days your students are not at school. Scholar uses this to work out when
          they actually have time to study, so getting it wrong means telling someone to
          start an essay on a day they are in lessons.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRestDays(p.days)}
              className="btn btn-ghost px-2.5 py-1 text-[12px]"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = restDays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(d.n)}
                className={
                  on
                    ? "rounded-lg border border-vx-400/40 bg-vx-400/[0.12] px-3 py-1.5 text-[12.5px] text-vx-200"
                    : "rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12.5px] text-slate-400 hover:border-white/20"
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {restDays.length === 0 && (
          <p className="mt-2 text-[12px] text-amber-300">
            With no days off, Scholar will assume your students are available every day.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[13.5px] font-medium text-slate-200">Grades</h2>
        <p className="mb-2.5 max-w-[54ch] text-[12.5px] leading-relaxed text-slate-400">
          How marks are written down for students and parents. Scholar always works
          out the same underlying figure from marks and weights — this decides only
          how it is written, so changing it re-labels existing grades rather than
          recalculating them.
        </p>

        <select
          value={gradingScheme}
          onChange={(e) => setGradingScheme(e.target.value)}
          className="input w-full max-w-[380px]"
        >
          {SCHEMES.map((s) => (
            <option key={s.id} value={s.id}>{s.name} — {s.region}</option>
          ))}
        </select>

        {/* A worked example, because "de-noten" tells an administrator
            nothing and "85% is written 2 (gut)" tells them everything. */}
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <p className="text-[11.5px] uppercase tracking-wide text-slate-500">
            A student on 85% would see
          </p>
          <p className="mt-1 text-[15px] font-semibold text-slate-100">
            {displayGrade(85, scheme(gradingScheme))?.text}
            {displayGrade(85, scheme(gradingScheme))?.name && (
              <span className="ms-1.5 text-[12.5px] font-normal text-slate-400">
                {displayGrade(85, scheme(gradingScheme))!.name}
              </span>
            )}
          </p>
          {!higherIsBetter(scheme(gradingScheme)) && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-200">
              On this scale a lower number is a better result. Scholar orders and
              colours grades accordingly.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13.5px] font-medium text-slate-200">Marking assistance</h2>
        <p className="mb-2.5 max-w-[54ch] text-[12.5px] leading-relaxed text-slate-400">
          Whether teachers can ask a model to suggest a mark. Doing so sends the
          student's submitted work to whichever provider is configured, so this is a
          decision about where your students' coursework goes — not a convenience
          setting. A suggestion never becomes a grade on its own; a teacher always
          records it.
        </p>

        <div className="space-y-2">
          {([
            ["off", "Off", "No student work is sent to any model."],
            ["institution", "Institution's provider only",
             "Teachers may ask for a suggestion, using the provider you configure. They cannot change it."],
            ["teacher", "Teachers choose their own",
             "Each teacher uses their own provider and key. You will not know which."],
          ] as const).map(([value, label, help]) => (
            <label
              key={value}
              className={
                aiPolicy === value
                  ? "flex cursor-pointer gap-3 rounded-lg border border-vx-400/40 bg-vx-400/[0.08] px-3.5 py-2.5"
                  : "flex cursor-pointer gap-3 rounded-lg border border-white/[0.08] px-3.5 py-2.5 hover:border-white/20"
              }
            >
              <input
                type="radio"
                name="aiPolicy"
                value={value}
                checked={aiPolicy === value}
                onChange={() => setAiPolicy(value)}
                className="mt-1"
              />
              <span>
                <span className="block text-[13px] text-slate-200">{label}</span>
                <span className="block text-[12px] leading-relaxed text-slate-400">{help}</span>
              </span>
            </label>
          ))}
        </div>

        {aiPolicy === "teacher" && (
          <p className="mt-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
            With this setting your institution cannot say where its students' work is
            being sent, because each teacher decides separately. If you are subject to
            the GDPR, the UK Age Appropriate Design Code or India's DPDP Act, that is
            likely to be a problem worth checking before you choose it.
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary px-4 py-2 text-[13px]"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && (
          <span className={message.ok ? "text-[12.5px] text-emerald-300" : "text-[12.5px] text-rose-300"}>
            {message.text}
          </span>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-slate-600">
        Changing the timezone does not move deadlines that already exist — each one keeps
        the clock it was written against, so nobody becomes late because a setting changed.
      </p>
    </div>
  );
}
