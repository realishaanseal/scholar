"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";
import ClassList, { type ClassSlot } from "./ClassList";
import TimetableImport from "./TimetableImport";
import DayDial from "./DayDial";

import {
  DAYS,
  WEEK_MINS,
  clockTime,
  dayEndMins,
  dayStartMins,
  endMinsOf,
  meta,
  mmss,
  pad,
  startMinsOf,
  timeRange,
  untilLabel,
} from "@/lib/scholar/timetableView";

type Upcoming = { c: ClassSlot; until: number };

/** One digit that rolls: the outgoing value slides up and out while the
 *  incoming one arrives from below, inside a fixed box so nothing reflows.
 *  The em-based size keeps it locked to the font, whatever scale the clock
 *  is rendered at. */
function RollDigit({ value }: { value: string }) {
  return (
    <span
      className="relative inline-block overflow-hidden align-baseline"
      style={{ width: "0.60em", height: "1.06em" }}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="absolute inset-0 flex items-center justify-center tabular-nums"
          initial={{ y: "-105%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "105%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A big, quietly-ticking digital clock — the thing that makes "nothing in
 *  session" read as alive rather than empty. Digits roll as they change and
 *  the colon breathes on the second. */
function LiveClock({ now }: { now: Date }) {
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return (
    <div>
      <div className="flex items-center justify-center text-6xl font-semibold tracking-tight text-white">
        <RollDigit value={hh[0]} />
        <RollDigit value={hh[1]} />
        <motion.span
          className="px-[0.06em]"
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          :
        </motion.span>
        <RollDigit value={mm[0]} />
        <RollDigit value={mm[1]} />
      </div>
    </div>
  );
}

/**
 * The panel's own backdrop: concentric rings with a slow conic sheen turning
 * behind them, masked to a soft annulus. Replaces the blurred blob and dot
 * grid that used to sit here — those read as filler behind a clock, whereas
 * these are built around the dial and give it something to sit in.
 */
function PanelBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 62% at 50% 46%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.09), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "repeating-radial-gradient(circle at center, transparent 0 45px, rgba(255,255,255,0.024) 45px 46px)",
          maskImage: "radial-gradient(circle at center, #000 26%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at center, #000 26%, transparent 70%)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 10%) / 0.11) 42deg, transparent 116deg, transparent 232deg, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 8%) / 0.08) 276deg, transparent 340deg)",
          maskImage: "radial-gradient(circle at center, transparent 33%, #000 60%, transparent 86%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, transparent 33%, #000 60%, transparent 86%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 54, ease: "linear", repeat: Infinity }}
      />
    </>
  );
}

/** Three small stats about the day — classes, break/library time, and how
 *  much of it is already behind you. */
function DayStats({ today, now }: { today: ClassSlot[]; now: Date }) {
  const nowOfDay = now.getHours() * 60 + now.getMinutes();
  const classCount = today.filter((c) => c.kind === "class").length;
  const breakMins = today
    .filter((c) => c.kind !== "class")
    .reduce((sum, c) => sum + (dayEndMins(c) - dayStartMins(c)), 0);
  const doneCount = today.filter((c) => dayEndMins(c) <= nowOfDay).length;

  const stats = [
    { label: "Classes today", value: String(classCount) },
    { label: "Break & library", value: breakMins > 0 ? `${Math.round((breakMins / 60) * 10) / 10}h` : "—" },
    { label: "Completed", value: `${doneCount}/${today.length}` },
  ];

  return (
    <div className="relative grid w-full max-w-[420px] grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          className="px-3 py-3 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.5 + i * 0.06 }}
        >
          <p className="text-lg font-semibold tabular-nums text-slate-100">{s.value}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-500">{s.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * The "Now" view.
 *
 * One layout for both states rather than two unrelated ones: the dial is
 * always the anchor, and only what sits inside it changes — a countdown while
 * a period runs, the clock while nothing does. That keeps the panel from
 * visibly re-arranging itself every time a lesson starts or ends.
 */
function HeroNow({
  ongoing, nextItem, now, today,
}: {
  ongoing: ClassSlot[]; nextItem: Upcoming | undefined; now: Date; today: ClassSlot[];
}) {
  const live = ongoing[0];
  const km = live ? meta(live.kind) : null;

  const nowMins = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const remainingSec = live
    ? Math.max(0, endMinsOf(live) * 60 - (nowMins * 60 + now.getSeconds()))
    : 0;

  return (
    <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-8 text-center">
      <PanelBackdrop />

      <motion.div
        className="relative flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-1.5"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <motion.span
          className={`h-1.5 w-1.5 rounded-full ${live ? km!.dot : "bg-emerald-400"}`}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {live ? `Live · ${km!.label.toLowerCase()} in progress` : "Live · free right now"}
        </span>
      </motion.div>

      <motion.div
        className="relative"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.06 }}
      >
        {/* An empty day has nothing to plot, and a dial drawn as a bare ring
            is just the old clock-in-a-void with a circle around it. Drop the
            ring entirely and let the clock and the up-next card carry it. */}
        <DayDial today={today} now={now} hidden={today.length === 0}>
          {live ? (
            <div>
              <div className={`text-4xl font-semibold tabular-nums ${km!.text}`}>
                {mmss(remainingSec)}
              </div>
              <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-slate-500">left</div>
              <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-white">
                {live.title}
              </p>
            </div>
          ) : (
            <div>
              <LiveClock now={now} />
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-slate-500">
                {DAYS[now.getDay()]}
              </div>
            </div>
          )}
        </DayDial>
      </motion.div>

      {live ? (
        <p className="relative max-w-[380px] truncate text-[13px] text-slate-400">
          {timeRange(live)}
          {live.teacherName ? ` · ${live.teacherName}` : ""}
          {live.location ? ` · ${live.location}` : ""}
        </p>
      ) : nextItem ? (
        <motion.div
          className={`relative w-full max-w-[380px] overflow-hidden rounded-2xl border bg-white/[0.03] px-5 py-4 text-left ${meta(nextItem.c.kind).border}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.35 }}
        >
          <span className={`absolute inset-y-0 left-0 w-[3px] ${meta(nextItem.c.kind).seg}`} aria-hidden />
          <div className="flex items-center justify-between gap-2 pl-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${meta(nextItem.c.kind).dot}`} />
              <p className="text-[11px] text-slate-500">Up next</p>
            </div>
            <p className={`text-[11px] font-medium tabular-nums ${meta(nextItem.c.kind).text}`}>
              {untilLabel(nextItem.until)}
            </p>
          </div>
          <p className="mt-1.5 truncate pl-2 text-lg font-semibold text-white">{nextItem.c.title}</p>
          <p className="mt-0.5 truncate pl-2 text-[12.5px] text-slate-500">
            {timeRange(nextItem.c)}
            {nextItem.c.teacherName && ` · ${nextItem.c.teacherName}`}
            {nextItem.c.location && ` · ${nextItem.c.location}`}
          </p>
        </motion.div>
      ) : (
        <p className="relative text-sm text-slate-500">Nothing else scheduled this week.</p>
      )}

      {today.length > 0 && <DayStats today={today} now={now} />}
    </div>
  );
}

/** A horizontal strip of today's periods — classes, breaks, and library time
 *  — laid out as a proportional sequence rather than a literal clock-scale
 *  timeline. Each chip's width reflects its own duration relative to the
 *  rest of the day, and every gap between chips is the same fixed size
 *  regardless of whether the real timetable has a 5-minute gap there or none
 *  at all — a strictly time-accurate bar made back-to-back periods (like a
 *  lunch break starting the instant class ends) look flush while periods
 *  with a few minutes' passing time between them showed a visible gap,
 *  which read as uneven even though both were "correct". Turns the
 *  otherwise-empty space under the hero into something worth looking at. */
function DayShape({ list, now }: { list: ClassSlot[]; now: Date }) {
  const today = list
    .filter((c) => c.dayOfWeek === now.getDay())
    .sort((a, b) => dayStartMins(a) - dayStartMins(b));

  const nowOfDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  if (today.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Today's shape</h4>
        <p className="mt-2 text-[12px] text-slate-500">Nothing scheduled today.</p>
      </div>
    );
  }

  const firstStart = dayStartMins(today[0]);
  const lastEnd = Math.max(...today.map(dayEndMins));
  const totalDuration = today.reduce((sum, c) => sum + Math.max(1, dayEndMins(c) - dayStartMins(c)), 0);
  const kindsPresent = Array.from(new Set(today.map((c) => c.kind)));

  // "Now" is placed by how far through the sequence of periods it falls —
  // proportional to cumulative duration, same as the chips themselves — so
  // the live marker still lands inside whichever chip is actually ongoing,
  // or just past the nearest edge when it's before/after the school day.
  let elapsedBefore = 0;
  let nowFrac: number | null = null;
  for (const c of today) {
    const s = dayStartMins(c);
    const e = dayEndMins(c);
    const dur = Math.max(1, e - s);
    if (nowOfDay < s) {
      nowFrac = nowFrac ?? elapsedBefore / totalDuration;
      break;
    }
    if (nowOfDay < e) {
      nowFrac = (elapsedBefore + (nowOfDay - s)) / totalDuration;
      break;
    }
    elapsedBefore += dur;
  }
  if (nowFrac === null && nowOfDay >= lastEnd) nowFrac = 1;
  const NEAR_MINS = 90;
  const showNowMarker =
    (nowOfDay >= firstStart && nowOfDay <= lastEnd) ||
    (nowOfDay < firstStart && firstStart - nowOfDay <= NEAR_MINS) ||
    (nowOfDay > lastEnd && nowOfDay - lastEnd <= NEAR_MINS);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Today's shape</h4>
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

      <div className="relative mt-4 h-14 w-full">
        <div className="flex h-full w-full gap-[3px] overflow-hidden rounded-xl border border-white/[0.06] bg-black/25 p-0.5">
          {today.map((c) => {
            const dur = Math.max(1, dayEndMins(c) - dayStartMins(c));
            const km = meta(c.kind);
            const isOngoing = dayStartMins(c) <= nowOfDay && nowOfDay < dayEndMins(c);
            const canLabel = dur / totalDuration > 0.08;
            return (
              <div
                key={c.id}
                title={`${c.title} · ${timeRange(c)}`}
                className="relative h-full overflow-hidden rounded-[7px]"
                style={{ flex: `${dur} 1 0%` }}
              >
                <div
                  className={`flex h-full w-full items-center justify-center transition-all duration-300
                              ${km.seg} ${isOngoing ? "z-10 opacity-100 ring-2 ring-inset ring-white/50" : "opacity-65 hover:opacity-85"}`}
                >
                  <div aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                  {canLabel && (
                    <span className="relative truncate px-1.5 text-[10px] font-medium text-white drop-shadow-sm">
                      {c.title}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showNowMarker && nowFrac !== null && (
          <div
            aria-hidden
            className="absolute inset-y-0 z-20 flex w-0 -translate-x-1/2 flex-col items-center"
            style={{ left: `${Math.min(99.6, Math.max(0.4, nowFrac * 100))}%` }}
          >
            <span className="-mt-1 h-2 w-2 shrink-0 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,0.65)]" />
            <span className="mt-0.5 w-px flex-1 bg-white/70" />
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-slate-600">
        <span>{clockTime(firstStart)}</span>
        <span>{clockTime(lastEnd)}</span>
      </div>
    </div>
  );
}

function Sidebar({ upcoming, now }: { upcoming: Upcoming[]; now: Date }) {
  let lastDay: number | null = null;

  return (
    <div>
      <h4 className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Up next</h4>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-[13px] text-slate-500">Nothing else scheduled this week.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {upcoming.map(({ c, until }, i) => {
            const km = meta(c.kind);
            const showDayHeader = c.dayOfWeek !== lastDay;
            lastDay = c.dayOfWeek;
            const dayLabel = c.dayOfWeek === now.getDay() ? "Today" : DAYS[c.dayOfWeek];

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(i, 12) * 0.04 }}
              >
                {showDayHeader && (
                  <p className="mb-1.5 mt-3 px-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-600 first:mt-0">
                    {dayLabel}
                  </p>
                )}
                <div
                  className={`relative overflow-hidden rounded-xl border pl-4 pr-3.5 py-3 transition-colors ${
                    i === 0 ? "border-white/[0.18] bg-white/[0.05]" : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  <span className={`absolute inset-y-0 left-0 w-[3px] ${km.seg}`} aria-hidden />
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-100">{c.title}</span>
                    <span className={`shrink-0 text-[10.5px] tabular-nums ${i === 0 ? km.text : "text-slate-500"}`}>
                      {untilLabel(until)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {timeRange(c)}
                    {c.teacherName && ` · ${c.teacherName}`}
                    {c.location && ` · ${c.location}`}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "Classes" — a live view of the student's timetable, on the same footing as
 * Settings in the dashboard header rather than buried a level down. Opening
 * it answers one question ("what's happening right now, and what's next")
 * without a trip to Settings, and its own Setup tab is where the timetable
 * gets built or fixed — the same import/edit machinery Settings uses, so
 * there's exactly one way classes actually get created, just two doors into it.
 *
 * Breaks and library periods are first-class rows here (see `kind` on
 * ClassSlot) — a lunch break shows as "on a break" with its own countdown,
 * and "Today's shape" draws the whole day including them, not just classes.
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
    // A 1s tick (not the old 30s) is what makes the ring, clock and "now"
    // marker feel alive rather than stepping — cheap while a modal is open,
    // fully stopped the instant it closes.
    const tick = setInterval(() => setNow(new Date()), 1000);
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
  const upcoming: Upcoming[] = list
    .filter((c) => !ongoing.includes(c))
    .map((c) => ({ c, until: (startMinsOf(c) - nowMins + WEEK_MINS) % WEEK_MINS }))
    .sort((a, b) => a.until - b.until)
    .slice(0, 10);
  const today = list
    .filter((c) => c.dayOfWeek === now.getDay())
    .sort((a, b) => dayStartMins(a) - dayStartMins(b));

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        aria-label="Classes"
        title="Classes"
        whileHover={{ y: -1, scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        transition={SPRING}
        className="group grid h-9 w-9 place-items-center rounded-xl border border-white/[0.10]
                   bg-white/[0.035] text-slate-400
                   hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9 2h6" />
        </svg>
      </motion.button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
        <motion.div
          key="classes-modal"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
            className="card flex h-full w-full max-w-[1100px] flex-col overflow-hidden sm:h-[min(90vh,880px)] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] p-5 sm:p-6">
              <h3 className="text-lg font-semibold tracking-tight text-white">Classes</h3>
              <button
      type="button"
      onClick={() => setOpen(false)}
                aria-label="Close"
                className="tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-slate-400 hover:text-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/[0.07] px-4 pt-2 sm:px-6">
              {([["now", "Now"], ["setup", "Setup"]] as const).map(([id, label]) => (
                <button
      type="button"
      key={id}
                  onClick={() => setTab(id)}
                  className={`tap-tall relative rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    tab === id ? "text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {label}
                  {tab === id && (
                    <motion.span
                      layoutId="classes-tab"
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-vx-400"
                      transition={SPRING}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {classes === null ? (
                <div className="space-y-2 p-5 sm:p-6">
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-xl" />)}
                </div>
              ) : tab === "now" ? (
                list.length === 0 ? (
                  <div className="p-5 sm:p-6">
                    <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                      <p className="text-sm text-slate-400">No timetable set up yet.</p>
                      <button type="button" className="btn-primary mt-4 px-4 py-2 text-xs" onClick={() => setTab("setup")}>
                        Set up your timetable
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[460px] flex-col sm:flex-row">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex-1">
                        <HeroNow ongoing={ongoing} nextItem={upcoming[0]} now={now} today={today} />
                      </div>
                      <div className="border-t border-white/[0.06] p-5 sm:p-6">
                        <DayShape list={list} now={now} />
                      </div>
                    </div>
                    <div className="w-full shrink-0 border-t border-white/[0.07] p-5 sm:w-[320px] sm:overflow-y-auto sm:border-l sm:border-t-0">
                      <Sidebar upcoming={upcoming} now={now} />
                    </div>
                  </div>
                )
              ) : (
                <div className="p-5 sm:p-6">
                  <p className="text-xs leading-relaxed text-slate-500">
                    Import or fix your timetable here any time — the same list is used everywhere in
                    Scholar, including Settings → Preferences. Breaks and library periods can be
                    imported too — tag them from the timetable text or fix the tag afterwards below.
                  </p>
                  <ClassList classes={list} onChanged={load} />
                  <TimetableImport onImported={load} />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
