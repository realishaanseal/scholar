"use client";

import { useState } from "react";
import AISettingsPanel from "./AISettingsPanel";
import StudySettingsPanel from "./StudySettingsPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import PreferencesPanel from "./PreferencesPanel";

type SectionId = "ai" | "study" | "insights" | "preferences" | "account";

const SECTIONS: { id: SectionId; label: string; hint: string; icon: string }[] = [
  {
    id: "ai",
    label: "AI settings",
    hint: "Provider, model and API key",
    icon: "M12 2l1.9 5.5L19 9l-5.1 1.5L12 16l-1.9-5.5L5 9l5.1-1.5z",
  },
  {
    id: "study",
    label: "Study time",
    hint: "Availability and learned pace",
    icon: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
  {
    id: "insights",
    label: "Insights",
    hint: "How your work actually goes",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    id: "preferences",
    label: "Preferences",
    hint: "Alerts, language, timetable, calendar",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    id: "account",
    label: "Account",
    hint: "Who you're signed in as",
    icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
];

export default function SettingsNav({
  email,
  name,
}: {
  email: string | null;
  name: string | null;
}) {
  const [section, setSection] = useState<SectionId>("ai");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:gap-8">
      <nav className="card animate-riseIn p-2 lg:sticky lg:top-24">
        {SECTIONS.map((s) => {
          const on = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors"
                style={
                  on
                    ? { background: "var(--grad-brand)", borderColor: "transparent" }
                    : { borderColor: "rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.025)" }
                }
              >
                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${on ? "text-white" : "text-slate-400"}`}
                  fill={s.id === "ai" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={s.icon} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${on ? "text-white" : "text-slate-300"}`}>
                  {s.label}
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0">
        {section === "ai" && <AISettingsPanel />}
        {section === "study" && <StudySettingsPanel />}
        {section === "insights" && <AnalyticsPanel />}
        {section === "preferences" && <PreferencesPanel />}
        {section === "account" && (
          <div className="card animate-riseIn p-6">
            <h3 className="text-sm font-semibold text-white">Account</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-white/[0.06] pb-3">
                <dt className="text-slate-500">Name</dt>
                <dd className="text-slate-200">{name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-200">{email ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              This is a local development build — your account and homework live in a SQLite file
              inside the project folder, not on any server.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
