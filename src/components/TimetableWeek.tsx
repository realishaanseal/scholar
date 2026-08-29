"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { EASE_OUT, SPRING_SOFT } from "@/components/motion";
import {
  DAYS,
  DAYS_SHORT,
  assignLanes,
  clockTime,
  dayEndMins,
  dayStartMins,
  durationMins,
  endMinsOf,
  meta,
  mmss,
  nowMinsOfDay,
  nowMinsOfWeek,
  ongoingAt,
  startMinsOf,
  timeRange,
  untilLabel,
  upcomingFrom,
  type ClassSlot,
} from "@/lib/scholar/timetableView";

/* The week starts Monday here rather than Sunday: a school week reads Mon->Fri,
   and leading with Sunday pushes the days that matter over to the right. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Height of the plotted area; the hour rows derive from the day's range. */
const GRID_H = 540;

/** A wall clock that re-renders once a second, but only while it's needed. */
function useTick(active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/* ── Now / next ────────────────────────────────────────────────────────────
   The question the page is actually opened to answer. A live period gets a
   countdown and a progress bar; otherwise the next one gets a lead time. */

export function NowStrip({ classes }: { classes: ClassSlot[] }) {
  const now = useTick(classes.length > 0);
  const today = now.getDay();

  const live = ongoingAt(classes, now)[0] ?? null;
  const next = upcomingFrom(classes, now)[0] ?? null;

  const todayList = useMemo(
    () =>
      classes
        .filter((c) => c.dayOfWeek === today)
        .sort((a, b) => dayStartMins(a) - dayStartMins(b)),
    // Keyed on the calendar day, not the second: rebuilding this list sixty
    // times a minute would be pure waste.
    [classes, today],
  );

  if (classes.length === 0) return null;

  const nowOfDay = nowMinsOfDay(now);
  const doneToday = todayList.filter((c) => dayEndMins(c) <= nowOfDay).length;

  const km = live ? meta(live.kind) : null;
  const total = live ? endMinsOf(live) - startMinsOf(live) : 0;
  const elapsed = live ? nowMinsOfWeek(now) - startMinsOf(live) : 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  const remainingSec = live
    ? Math.max(0, endMinsOf(live) * 60 - (nowMinsOfWeek(now) * 60 + now.getSeconds()))
    : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="card relative overflow-hidden p-5 sm:p-6"
    >
      {live && <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${km!.seg}`} />}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-[15rem] flex-1">
          <div className="flex items-center gap-2">
            <motion.span
              className={`h-1.5 w-1.5 rounded-full ${live ? km!.dot : "bg-slate-500"}`}
              animate={live ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              {live ? `${km!.label} in progress` : "Nothing in session"}
            </span>
          </div>

          {live ? (
            <>
              <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {live.title}
              </h2>
              <p className="mt-1 truncate text-[13px] text-slate-400">
                {timeRange(live)}
                {live.teacherName ? ` · ${live.teacherName}` : ""}
                {live.location ? ` · ${live.location}` : ""}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className={`h-full rounded-full ${km!.seg}`}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: EASE_OUT }}
                  />
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${km!.text}`}>
                  {mmss(remainingSec)} left
                </span>
              </div>
            </>
          ) : next ? (
            <>
              <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {next.c.title}
              </h2>
              <p className="mt-1 truncate text-[13px] text-slate-400">
                {next.c.dayOfWeek === today ? "Today" : DAYS[next.c.dayOfWeek]}
                {" · "}
                {timeRange(next.c)}
                {next.c.location ? ` · ${next.c.location}` : ""}
              </p>
              <p className={`mt-3 text-sm font-medium ${meta(next.c.kind).text}`}>
                Starts {untilLabel(next.until)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Nothing else scheduled this week.</p>
          )}
        </div>

        <div className="flex shrink-0 items-stretch gap-2.5">
          <Stat label="Today" value={String(todayList.length)} hint="periods" />
          <Stat label="Done" value={`${doneToday}/${todayList.length}`} hint="so far" />
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-[86px] rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-center">
      <div className="text-lg font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="text-[10px] text-slate-600">{hint}</div>
    </div>
  );
}

/* ── Week grid ─────────────────────────────────────────────────────────────
   The timetable as an actual timetable: days across, time down, every period
   drawn to scale. Overlapping rows are laid into lanes side by side rather
   than stacked invisibly on top of one another. */

export function TimetableWeek({ classes }: { classes: ClassSlot[] }) {
  const now = useTick(classes.length > 0);

  const days = useMemo(
    () => WEEK_ORDER.filter((d) => classes.some((c) => c.dayOfWeek === d)),
    [classes],
  );

  const { from, to } = useMemo(() => {
    if (classes.length === 0) return { from: 8 * 60, to: 16 * 60 };
    const lo = Math.min(...classes.map(dayStartMins));
    const hi = Math.max(...classes.map(dayEndMins));
    // Snap out to whole hours so the rules read as a clock, and hold a
    // six-hour floor so one short day isn't blown up to fill the panel.
    const f = Math.floor(lo / 60) * 60;
    const t = Math.max(Math.ceil(hi / 60) * 60, f + 360);
    return { from: f, to: t };
  }, [classes]);

  const range = to - from;
  const hours = useMemo(
    () => Array.from({ length: Math.floor(range / 60) + 1 }, (_, i) => from + i * 60),
    [from, range],
  );

  if (classes.length === 0) return null;

  const nowOfDay = nowMinsOfDay(now);
  const nowVisible = nowOfDay >= from && nowOfDay <= to;
  const nowTopPct = ((nowOfDay - from) / range) * 100;
  const kindsPresent = (["class", "break", "library"] as const).filter((k) =>
    classes.some((c) => c.kind === k),
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.08 }}
      className="card overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold text-white">Your week</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {clockTime(from)}–{clockTime(to)} · {classes.length} period
            {classes.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {kindsPresent.map((k) => (
            <span
              key={k}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-[10px] text-slate-400"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta(k).dot}`} />
              {meta(k).label}
            </span>
          ))}
        </div>
      </div>

      {/* Scroll rather than squeeze: seven legible columns beat seven
          unreadable ones on a phone. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px] px-5 pb-5 pt-3">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `46px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((d) => {
              const isToday = d === now.getDay();
              return (
                <div key={d} className="pb-2 text-center">
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                      isToday ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {DAYS_SHORT[d]}
                  </div>
                  {isToday && (
                    <div
                      className="mx-auto mt-1 h-0.5 w-6 rounded-full"
                      style={{ background: "var(--grad-brand)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="relative grid gap-1.5"
            style={{
              gridTemplateColumns: `46px repeat(${days.length}, minmax(0, 1fr))`,
              height: GRID_H,
            }}
          >
            {/* Hour gutter */}
            <div className="relative">
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-slate-600"
                  style={{ top: `${((h - from) / range) * 100}%` }}
                >
                  {clockTime(h)}
                </span>
              ))}
            </div>

            {days.map((d, di) => {
              const laned = assignLanes(classes.filter((c) => c.dayOfWeek === d));
              const isToday = d === now.getDay();
              return (
                <div
                  key={d}
                  className={`relative rounded-lg border ${
                    isToday
                      ? "border-white/[0.10] bg-white/[0.025]"
                      : "border-white/[0.05] bg-white/[0.012]"
                  }`}
                >
                  {hours.slice(1, -1).map((h) => (
                    <span
                      key={h}
                      className="absolute inset-x-0 border-t border-white/[0.05]"
                      style={{ top: `${((h - from) / range) * 100}%` }}
                    />
                  ))}

                  {laned.map(({ slot, lane, lanes }, i) => {
                    const km = meta(slot.kind);
                    const top = ((dayStartMins(slot) - from) / range) * 100;
                    const height = (durationMins(slot) / range) * 100;
                    const isLive =
                      isToday && dayStartMins(slot) <= nowOfDay && nowOfDay < dayEndMins(slot);
                    // Below roughly a 40-minute block there is only room for
                    // the title, so the supporting lines are dropped rather
                    // than clipped mid-word.
                    const tall = durationMins(slot) / range > 0.075;

                    return (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, scaleY: 0.6 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ ...SPRING_SOFT, delay: 0.03 * di + 0.02 * i }}
                        whileHover={{ scale: 1.03, zIndex: 20 }}
                        title={`${slot.title} · ${timeRange(slot)}${
                          slot.location ? ` · ${slot.location}` : ""
                        }`}
                        className={`absolute origin-top overflow-hidden rounded-md border px-1.5 py-1 text-left ${
                          km.border
                        } ${isLive ? "ring-1 ring-inset ring-white/45" : ""}`}
                        style={{
                          top: `${top}%`,
                          height: `calc(${height}% - 3px)`,
                          left: `calc(${(lane / lanes) * 100}% + 3px)`,
                          width: `calc(${(1 / lanes) * 100}% - 6px)`,
                          background: `linear-gradient(180deg, ${km.hex}2e, ${km.hex}12)`,
                        }}
                      >
                        <div className="truncate text-[11px] font-medium leading-tight text-white">
                          {slot.title}
                        </div>
                        {tall && (
                          <div className="mt-0.5 truncate text-[9.5px] tabular-nums text-slate-400">
                            {timeRange(slot)}
                          </div>
                        )}
                        {tall && slot.location && (
                          <div className="truncate text-[9.5px] text-slate-500">{slot.location}</div>
                        )}
                      </motion.div>
                    );
                  })}

                  {/* The live "now" line, drawn only down today's column */}
                  {isToday && nowVisible && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-30"
                      style={{ top: `${nowTopPct}%` }}
                    >
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.55)]" />
                      <span className="block h-px w-full bg-rose-400/70" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
