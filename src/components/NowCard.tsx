"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SOFT } from "@/components/motion";
import type { HomeworkDTO } from "@/lib/clientTypes";

export type NowPayload = {
  now: {
    availableNowMins: number;
    recommendation: {
      task: { id: string; title: string; subject: string };
      risk: { level: string; score: number; remainingMins: number; reason: string };
      rationale: string;
      sessionMins: number;
      partial: boolean;
    } | null;
    alternatives: Array<{ task: { id: string; title: string; subject: string }; risk: { level: string } }>;
    emptyReason: string | null;
  };
  workload: {
    headline: string;
    totalMins: number;
    overdueCount: number;
    days: Array<{
      date: string; label: string; workMins: number; capacityMins: number;
      deadlines: number; overloaded: boolean; utilisation: number;
    }>;
  };
  /** Risk assessment per homework id, so the list can explain each item. */
  risks: Record<string, TaskRiskDTO | undefined>;
};

export type TaskRiskDTO = {
  level: "critical" | "high" | "moderate" | "low" | "none";
  score: number;
  remainingMins: number;
  availableMins: number;
  reason: string;
  recommendedStart: string | null;
};

const LEVEL_ACCENT: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  moderate: "#f59e0b",
  low: "#10b981",
  none: "#64748b",
};

/**
 * "What should I do now" — the defining interaction. One recommendation, the
 * reasoning behind it, and a single action. Alternatives stay collapsed so the
 * card answers the question rather than re-presenting the whole list.
 */
export default function NowCard({
  data,
  homework,
  onStart,
  onSetMinutes,
  minutes,
}: {
  data: NowPayload | null;
  homework: HomeworkDTO[];
  onStart: (hw: HomeworkDTO) => void;
  onSetMinutes: (mins: number | null) => void;
  minutes: number | null;
}) {
  const [showAlts, setShowAlts] = useState(false);

  if (!data) {
    return <div className="card skeleton-shimmer h-[168px]" />;
  }

  const { recommendation, availableNowMins, alternatives, emptyReason } = data.now;
  const accent = recommendation ? LEVEL_ACCENT[recommendation.risk.level] ?? "#5b7cfa" : "#64748b";

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.05 }}
      className="card overflow-hidden p-5 sm:p-6 xl:p-7"
      style={{ boxShadow: `0 18px 50px -20px rgba(0,0,0,0.85), inset 0 0 90px -50px ${accent}33` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-white">What to work on now</h2>
        <TimeBudget minutes={minutes} available={availableNowMins} onSet={onSetMinutes} />
      </div>

      {!recommendation ? (
        <p className="mt-5 text-sm text-slate-400">{emptyReason}</p>
      ) : (
        <>
          <motion.div
            key={recommendation.task.id}
            className="mt-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ background: `${accent}1f`, color: accent }}
              >
                {recommendation.risk.level === "low" ? "On track" : recommendation.risk.level}
              </span>
              <span className="text-[11px] text-slate-500">{recommendation.task.subject}</span>
            </div>

            <h3 className="mt-2.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {recommendation.task.title}
            </h3>

            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-400">
              {recommendation.rationale}
            </p>
          </motion.div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.025, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className="btn-primary w-full px-6 py-3 sm:w-auto sm:py-2.5"
              onClick={() => {
                const hw = homework.find((h) => h.id === recommendation.task.id);
                if (hw) onStart(hw);
              }}
            >
              Start — {recommendation.sessionMins}m session
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </motion.button>

            {alternatives.length > 0 && (
              <button className="btn-ghost px-4 py-2.5 text-xs" onClick={() => setShowAlts((v) => !v)}>
                {showAlts ? "Hide" : `${alternatives.length} other option${alternatives.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {showAlts && (
              <motion.div
                key="alts"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-1.5">
                  {alternatives.map((alt, i) => (
                    <motion.button
                      key={alt.task.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
                      whileHover={{ x: 3 }}
                      onClick={() => {
                        const hw = homework.find((h) => h.id === alt.task.id);
                        if (hw) onStart(hw);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]
                                 px-3 py-2.5 text-left text-[13px] text-slate-300 transition-colors
                                 hover:border-white/12 hover:bg-white/[0.05]"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: LEVEL_ACCENT[alt.risk.level] ?? "#64748b" }}
                      />
                      <span className="truncate">{alt.task.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-600">{alt.task.subject}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <WorkloadStrip workload={data.workload} />
    </motion.section>
  );
}

/** Lets the student say "I actually only have 45 minutes" and re-plan around it. */
function TimeBudget({
  minutes, available, onSet,
}: { minutes: number | null; available: number; onSet: (m: number | null) => void }) {
  const OPTIONS = [30, 60, 90];
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-[11px] text-slate-500">I have</span>
      {OPTIONS.map((m) => (
        <button
          key={m}
          onClick={() => onSet(minutes === m ? null : m)}
          className={`tap-44 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            minutes === m
              ? "bg-white/[0.12] text-white"
              : "border border-white/[0.07] text-slate-500 hover:text-slate-300"
          }`}
        >
          {m}m
        </button>
      ))}
      {minutes === null && (
        <span className="ml-1 text-[11px] text-slate-600">· {available}m left today</span>
      )}
    </div>
  );
}

/** Compact two-week load view. Bars are utilisation against that day's capacity. */
function WorkloadStrip({ workload }: { workload: NowPayload["workload"] }) {
  const week = workload.days.slice(0, 7);
  const maxMins = Math.max(60, ...week.map((d) => Math.max(d.workMins, d.capacityMins)));

  return (
    <div className="mt-7 border-t border-white/[0.06] pt-5">
      <p className="text-[13px] text-slate-400">{workload.headline}</p>

      <div className="mt-4 flex items-end gap-1.5">
        {week.map((d, di) => {
          const h = Math.max(3, (d.workMins / maxMins) * 56);
          const capH = (d.capacityMins / maxMins) * 56;
          return (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center gap-1.5">
              <div className="relative h-[56px] w-full">
                {/* Capacity line — the level above which the day is overcommitted. */}
                <div
                  className="absolute inset-x-0 border-t border-dashed border-white/15"
                  style={{ bottom: `${capH}px` }}
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 origin-bottom rounded-t-[3px]"
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}px` }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.04 * di }}
                  style={{
                    background: d.overloaded
                      ? "linear-gradient(180deg,#ef4444,#b91c1c)"
                      : d.workMins > 0
                      ? "linear-gradient(180deg,#5b7cfa,#4c5fd7)"
                      : "rgba(255,255,255,0.06)",
                  }}
                />
              </div>
              <span className={`text-[10px] ${d.overloaded ? "text-red-300" : "text-slate-600"}`}>
                {d.label.slice(0, 3)}
              </span>

              {d.workMins > 0 && (
                <span className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md border border-white/10 bg-[#0b0e17] px-2 py-1 text-[10px] text-slate-300 shadow-xl group-hover:block">
                  {Math.round(d.workMins / 60 * 10) / 10}h · {d.deadlines} due
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
