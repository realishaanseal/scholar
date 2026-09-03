"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useNotifications } from "./PwaSetup";
import { offeredLocales, PLANNED_LOCALES } from "@/lib/i18n/locales";

const OFFERED = offeredLocales();

type Prefs = Record<string, boolean>;

const SIGNALS: Array<{ kind: string; label: string; hint: string }> = [
  { kind: "insufficient-time", label: "Not enough time", hint: "A task needs more time than remains before its deadline" },
  { kind: "deadline-cluster", label: "Overloaded days", hint: "Several deadlines land on the same day" },
  { kind: "overdue-pileup", label: "Overdue building up", hint: "Three or more tasks are past their deadline" },
  { kind: "exam-approaching", label: "Exam with little prep", hint: "An exam is close and nothing is scheduled for it" },
  { kind: "chronic-underestimation", label: "Estimates running over", hint: "A subject consistently takes longer than planned" },
  { kind: "repeated-lateness", label: "Finishing late", hint: "A recent pattern of missing deadlines" },
];

/**
 * The three pickers below are deliberately not the same list.
 *
 * What Scholar can *understand* and what Scholar has been *translated into*
 * are different questions. Input goes to a multilingual model, which reads
 * Bengali perfectly well whether or not anyone has translated the settings
 * screen — so those two keep the full list. The interface picker is gated to
 * locales that actually exist, because offering one that does not is a
 * promise the product breaks the moment it is chosen.
 */
const UNDERSTOOD = [...OFFERED, ...PLANNED_LOCALES];

export default function PreferencesPanel() {
  const notifications = useNotifications();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [languages, setLanguages] = useState<any>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const [signals, study] = await Promise.all([
      fetchJson<{ prefs: Prefs }>("/api/scholar/signals"),
      fetchJson<{ languages: any }>("/api/settings/study"),
    ]);
    if (signals.data) setPrefs(signals.data.prefs);
    if (study.data?.languages) setLanguages(study.data.languages);
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
      type="button"
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
      type="button"
      className="btn-ghost ml-auto shrink-0 px-3 py-2 text-xs"
              onClick={() => notifications.show("Test notification", "This is what an alert looks like.", "scholar-test")}
            >
              Send a test
            </button>
          )}
        </div>

        <button
      type="button"
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
              value={
                OFFERED.some((l) => l.code === languages?.interfaceLanguage)
                  ? languages!.interfaceLanguage
                  : "en"
              }
              onChange={(e) => saveLanguage({ interfaceLanguage: e.target.value })}
            >
              {OFFERED.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
            {/* Said plainly to anyone who picked a language before this list
                was honest about itself. Their choice is remembered; it is not
                available yet; that is not a fault of theirs. */}
            {languages?.interfaceLanguage &&
              !OFFERED.some((l) => l.code === languages.interfaceLanguage) && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-300">
                  You chose{" "}
                  {PLANNED_LOCALES.find((l) => l.code === languages.interfaceLanguage)
                    ?.native ?? languages.interfaceLanguage}
                  , which is not finished yet — Scholar is showing English until it is.
                  You can still write and get replies in it below.
                </p>
              )}
          </Field>

          <Field label="You write in">
            <select
              className="input py-2 text-[13px]"
              value={languages?.inputLanguage ?? "auto"}
              onChange={(e) => saveLanguage({ inputLanguage: e.target.value })}
            >
              <option value="auto">Any / mixed</option>
              {UNDERSTOOD.map((l) => (
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
              {UNDERSTOOD.map((l) => (
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
