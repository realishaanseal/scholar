"use client";

import { useState } from "react";
import AISettingsPanel from "./AISettingsPanel";
import StudySettingsPanel from "./StudySettingsPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import PreferencesPanel from "./PreferencesPanel";
import GroupsPanel from "./GroupsPanel";
import SharingPanel from "./SharingPanel";
import AccountPanel from "./AccountPanel";

type SectionId = "ai" | "study" | "insights" | "preferences" | "groups" | "sharing" | "account";

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
    id: "groups",
    label: "Groups",
    hint: "Shared boards for group work",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    id: "sharing",
    label: "Sharing",
    hint: "What a parent or guardian can see",
    icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
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
        {section === "groups" && <GroupsPanel />}
        {section === "sharing" && <SharingPanel />}
        {section === "account" && <AccountPanel name={name} email={email} />}
      </div>
    </div>
  );
}
