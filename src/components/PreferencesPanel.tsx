"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import LmsImport from "./LmsImport";
import TimetableImport from "./TimetableImport";
import ExtensionSetup from "./ExtensionSetup";
import GoogleCalendarPanel from "./GoogleCalendarPanel";
import { useNotifications } from "./PwaSetup";

type Prefs = Record<string, boolean>;

const SIGNALS: Array<{ kind: string; label: string; hint: string }> = [
  { kind: "insufficient-time", label: "Not enough time", hint: "A task needs more time than remains before its deadline" },
  { kind: "deadline-cluster", label: "Overloaded days", hint: "Several deadlines land on the same day" },
  { kind: "overdue-pileup", label: "Overdue building up", hint: "Three or more tasks are past their deadline" },
  { kind: "exam-approaching", label: "Exam with little prep", hint: "An exam is close and nothing is scheduled for it" },
  { kind: "chronic-underestimation", label: "Estimates running over", hint: "A subject consistently takes longer than planned" },
  { kind: "repeated-lateness", label: "Finishing late", hint: "A recent pattern of missing deadlines" },
];

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ClassSlot = {
  id: string; title: string; subjectName: string | null; dayOfWeek: number;
  startHour: number; startMin: number; endHour: number; endMin: number; location: string | null;
};

export default function PreferencesPanel() {
  const notifications = useNotifications();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [languages, setLanguages] = useState<any>(null);
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const [signals, study, timetable] = await Promise.all([
      fetchJson<{ prefs: Prefs }>("/api/scholar/signals"),
      fetchJson<{ languages: any }>("/api/settings/study"),
      fetchJson<{ classes: ClassSlot[] }>("/api/timetable"),
    ]);
    if (signals.data) setPrefs(signals.data.prefs);
    if (study.data?.languages) setLanguages(study.data.languages);
    if (timetable.data) setClasses(timetable.data.classes ?? []);
  }

  useEffect(() => { load(); }, []);

  async function togglePref(kind: string, value: boolean) {
    setPrefs((p) => (p ? { ...p, [kind]: value } : p));
    await fetchJson("/api/scholar/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: { [kind]: value } }),
    });
  }

  async function saveLanguage(patch: Record<string, string>) {
    setLanguages((l: any) => ({ ...l, ...patch }));
    await fetchJson("/api/settings/study", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: patch }),
    });
    setStatus("Saved");
    setTimeout(() => setStatus(null), 1600);
  }

  async function removeClass(id: string) {
    setClasses((c) => c.filter((x) => x.id !== id));
    await fetchJson(`/api/timetable?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-5">
      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      <section className="card animate-riseIn p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Alerts</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Scholar only raises these when the numbers actually warrant it — there are no
              recurring reminders and nothing fires on a timer.
            </p>
          </div>
          {status && <span className="shrink-0 text-[11px] text-emerald-300">{status}</span>}
        </div>

        <div className="mt-5 space-y-1">
          {SIGNALS.map((s) => (
            <label
              key={s.kind}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-vx-500"
                checked={prefs?.[s.kind] ?? false}
                onChange={(e) => togglePref(s.kind, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-200">{s.label}</span>
                <span className="block text-[11px] leading-snug text-slate-500">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Shown by the app itself while it's open. Real web-push would need a
            server that stays awake plus VAPID keys — a local build has neither. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          <div className="min-w-0">
            <p className="text-[13px] text-slate-200">Desktop notifications</p>
            <p className="text-[11px] leading-snug text-slate-500">
              {notifications.permission === "granted"
                ? "Alerts appear as system notifications while Scholar is running."
                : notifications.permission === "denied"
                ? "Blocked in your browser's site settings."
                : notifications.permission === "unsupported"
                ? "This browser doesn't support notifications."
                : "Allow notifications to see alerts outside the tab."}
            </p>
          </div>

          {notifications.permission === "default" && (
            <button
              className="btn-ghost ml-auto shrink-0 px-3 py-2 text-xs"
              onClick={async () => {
                const result = await notifications.request();
                if (result === "granted") {
                  notifications.show("Notifications on", "Scholar will tell you when work is at risk.", "scholar-test");
                }
              }}
            >
              Allow
            </button>
          )}

          {notifications.permission === "granted" && (
            <button
              className="btn-ghost ml-auto shrink-0 px-3 py-2 text-xs"
              onClick={() => notifications.show("Test notification", "This is what an alert looks like.", "scholar-test")}
            >
              Send a test
            </button>
          )}
        </div>

        <button
          className="btn-ghost mt-4 px-3 py-2 text-xs"
          onClick={async () => {
            await fetchJson("/api/scholar/signals", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clearDismissed: true }),
            });
            setStatus("Dismissed alerts restored");
            setTimeout(() => setStatus(null), 2200);
          }}
        >
          Restore dismissed alerts
        </button>
      </section>

      {/* ── Language ───────────────────────────────────────────────────── */}
      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Language</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          These are separate on purpose. You can read an English interface, type in a mix of
          languages, and still get answers back in whichever you prefer.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Interface">
            <select
              className="input py-2 text-[13px]"
              value={languages?.interfaceLanguage ?? "en"}
              onChange={(e) => saveLanguage({ interfaceLanguage: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
          </Field>

          <Field label="You write in">
            <select
              className="input py-2 text-[13px]"
              value={languages?.inputLanguage ?? "auto"}
              onChange={(e) => saveLanguage({ inputLanguage: e.target.value })}
            >
              <option value="auto">Any / mixed</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
          </Field>

          <Field label="Replies in">
            <select
              className="input py-2 text-[13px]"
              value={languages?.responseLanguage ?? "match"}
              onChange={(e) => saveLanguage({ responseLanguage: e.target.value })}
            >
              <option value="match">Match what I wrote</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          Mixed input works without changing anything — &ldquo;physics ka ch 4 friday ko submit
          karna hai&rdquo; is read as a Physics assignment due Friday.
        </p>
      </section>

      {/* ── Timetable ──────────────────────────────────────────────────── */}
      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Class timetable</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Recurring classes, so the coach knows when you&apos;re in lessons rather than free to study.
        </p>

        {classes.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {classes.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <span className="w-20 shrink-0 text-[11px] text-slate-500">{DAYS[c.dayOfWeek].slice(0, 3)}</span>
                <span className="w-24 shrink-0 text-[11px] tabular-nums text-slate-500">
                  {pad(c.startHour)}:{pad(c.startMin)}–{pad(c.endHour)}:{pad(c.endMin)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">{c.title}</span>
                <button
                  onClick={() => removeClass(c.id)}
                  className="shrink-0 text-slate-600 hover:text-red-300"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <TimetableImport onImported={load} />

        {/* The manual form stays: the import above needs an AI provider and a
            readable source, and a student adding one class shouldn't have to
            go through a parse step to do it. */}
        <AddClassForm onAdded={load} />
      </section>

      <LmsImport />

      <ExtensionSetup />

      {/* ── Calendar ───────────────────────────────────────────────────── */}
      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Calendar</h3>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-slate-200">Calendar file (.ics)</span>
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                  Available
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                Download your deadlines and classes, then import into Google Calendar, Outlook or
                Apple Calendar.
              </p>
            </div>
            <a href="/api/calendar/export" className="btn-primary shrink-0 px-4 py-2 text-xs" download>
              Download .ics
            </a>
          </div>
        </div>

        <GoogleCalendarPanel />

        {/* Stated as pending rather than shipped as a button that does nothing. */}
        <div className="mt-2.5 rounded-xl border border-white/[0.05] bg-white/[0.012] p-4 opacity-70">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-400">Outlook Calendar</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Not yet connected
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
            Two-way sync needs a registered Microsoft application.
          </p>
        </div>
      </section>
    </div>
  );
}

function AddClassForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", dayOfWeek: 1, startHour: 9, endHour: 10 });
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const { ok, error } = await fetchJson("/api/timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, startMin: 0, endMin: 0 }),
    });
    if (ok) {
      setForm({ title: "", dayOfWeek: 1, startHour: 9, endHour: 10 });
      setOpen(false);
      onAdded();
    } else setError(error ?? "Couldn't add that class.");
  }

  if (!open) {
    return (
      <button className="btn-ghost mt-4 px-3 py-2 text-xs" onClick={() => setOpen(true)}>
        Add a class
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          className="input py-2 text-[13px]"
          placeholder="e.g. Physics"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <select
          className="input w-auto py-2 text-[13px]"
          value={form.dayOfWeek}
          onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
        >
          {DAYS.map((d, i) => <option key={d} value={i}>{d.slice(0, 3)}</option>)}
        </select>
        <select
          className="input w-auto py-2 text-[13px]"
          value={form.startHour}
          onChange={(e) => setForm({ ...form, startHour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
        </select>
        <select
          className="input w-auto py-2 text-[13px]"
          value={form.endHour}
          onChange={(e) => setForm({ ...form, endHour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
        </select>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button className="btn-primary px-4 py-2 text-xs" onClick={submit} disabled={form.title.trim().length < 1}>
          Add
        </button>
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
