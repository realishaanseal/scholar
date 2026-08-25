"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import ClassList, { type ClassSlot } from "./ClassList";
import TimetableImport from "./TimetableImport";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
const WEEK_MINS = 7 * 24 * 60;

function startMinsOf(c: ClassSlot) { return c.dayOfWeek * 1440 + c.startHour * 60 + c.startMin; }
function endMinsOf(c: ClassSlot) { return c.dayOfWeek * 1440 + c.endHour * 60 + c.endMin; }

function timeRange(c: ClassSlot) {
  return `${pad(c.startHour)}:${pad(c.startMin)}–${pad(c.endHour)}:${pad(c.endMin)}`;
}

function untilLabel(mins: number): string {
  if (mins < 1) return "starting now";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `in ${Math.floor(mins / 1440)}d`;
}

/**
 * "Classes" — a live view of the student's timetable, on the same footing as
 * Settings in the dashboard header rather than buried a level down. Opening
 * it answers one question ("what's happening right now, and what's next")
 * without a trip to Settings, and its own Setup tab is where the timetable
 * gets built or fixed — the same import/edit machinery Settings uses, so
 * there's exactly one way classes actually get created, just two doors into it.
 */
export default function LiveClasses() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"now" | "setup">("now");
  const [classes, setClasses] = useState<ClassSlot[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  async function load() {
    const { data } = await fetchJson<{ classes: ClassSlot[] }>("/api/timetable");
    setClasses(data?.classes ?? []);
  }

  useEffect(() => {
    if (!open) return;
    load();
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const nowMins = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const list = classes ?? [];
  const ongoing = list.filter((c) => startMinsOf(c) <= nowMins && nowMins < endMinsOf(c));
  const upcoming = list
    .filter((c) => !ongoing.includes(c))
    .map((c) => ({ c, until: (startMinsOf(c) - nowMins + WEEK_MINS) % WEEK_MINS }))
    .sort((a, b) => a.until - b.until)
    .slice(0, 6);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Classes"
        title="Classes"
        className="group grid h-9 w-9 place-items-center rounded-xl border border-white/[0.10]
                   bg-white/[0.035] text-slate-400 transition-all duration-300 ease-spring
                   hover:-translate-y-[1px] hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9 2h6" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="card animate-riseIn flex h-full w-full max-w-[640px] flex-col overflow-hidden sm:h-[min(85vh,760px)] sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] p-5 sm:p-6">
              <h3 className="text-lg font-semibold tracking-tight text-white">Classes</h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-slate-400 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/[0.07] px-4 pt-2 sm:px-6">
              {([["now", "Now"], ["setup", "Setup"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`tap-tall rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    tab === id ? "border-b-2 border-vx-400 text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {classes === null ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-xl" />)}
                </div>
              ) : tab === "now" ? (
                list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                    <p className="text-sm text-slate-400">No timetable set up yet.</p>
                    <button className="btn-primary mt-4 px-4 py-2 text-xs" onClick={() => setTab("setup")}>
                      Set up your timetable
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Right now</h4>
                      {ongoing.length === 0 ? (
                        <p className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-[13px] text-slate-500">
                          No class in session.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {ongoing.map((c) => {
                            const total = endMinsOf(c) - startMinsOf(c);
                            const elapsed = Math.max(0, Math.min(total, nowMins - startMinsOf(c)));
                            const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
                            const left = total - elapsed;
                            return (
                              <div key={c.id} className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">{c.title}</span>
                                  <span className="shrink-0 text-[11px] tabular-nums text-emerald-300">{left}m left</span>
                                </div>
                                <p className="mt-1 text-[11.5px] text-slate-400">
                                  {timeRange(c)}
                                  {c.teacherName && ` · ${c.teacherName}`}
                                  {c.location && ` · ${c.location}`}
                                </p>
                                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                  <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Coming up</h4>
                      {upcoming.length === 0 ? (
                        <p className="mt-2 text-[13px] text-slate-500">Nothing else scheduled this week.</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {upcoming.map(({ c, until }) => (
                            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                              <span className="w-14 shrink-0 text-[11px] text-slate-500">
                                {c.dayOfWeek === now.getDay() ? "Today" : DAYS[c.dayOfWeek].slice(0, 3)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] text-slate-200">{c.title}</span>
                                <span className="block text-[11px] text-slate-600">
                                  {timeRange(c)}
                                  {c.teacherName && ` · ${c.teacherName}`}
                                  {c.location && ` · ${c.location}`}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{untilLabel(until)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Import or fix your timetable here any time — the same list is used everywhere in
                    Scholar, including Settings → Preferences.
                  </p>
                  <ClassList classes={list} onChanged={load} />
                  <TimetableImport onImported={load} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
