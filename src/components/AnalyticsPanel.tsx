"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";

type SubjectStat = {
  subject: string;
  sessions: number;
  averageActualMins: number;
  estimatedMins: number;
  actualMins: number;
  onTimeRate: number;
  accuracy: number | null;
};

type WeekPoint = {
  weekStart: string; label: string; completed: number; minutes: number; onTime: number;
};

type Analytics = {
  totalSessions: number;
  timedSessions: number;
  totalMinutes: number;
  onTimeRate: number;
  accuracy: number | null;
  averageTaskMins: number;
  subjects: SubjectStat[];
  weeks: WeekPoint[];
  onTimeTrend: number | null;
};

/*
  Chart colours: a single-hue ordinal ramp on the dark card surface (#0d1019),
  validated for monotone lightness, step separation and contrast. Deliberately
  no categorical palette — every chart here is single-series or a two-shade
  comparison, so identity never rests on hue.
*/
const RAMP = { deep: "#3546bd", mid: "#4560e8", base: "#5b7cfa", light: "#7d9bff", pale: "#a5b8ff" };
const SURFACE = "#0d1019";
const GRID = "rgba(255,255,255,0.07)";

export default function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    fetchJson<Analytics>("/api/scholar/analytics").then(({ data }) => data && setData(data));
  }, []);

  if (!data) return <div className="card skeleton-shimmer h-[420px]" />;

  if (data.totalSessions === 0) {
    return (
      <div className="card animate-riseIn p-10 text-center">
        <h3 className="text-sm font-semibold text-white">No history yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          Finish a few tasks with the focus timer and this fills in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <KpiRow data={data} />
      <WeeklyChart weeks={data.weeks} />
      <EstimateAccuracy subjects={data.subjects} />

      <section className="card animate-riseIn p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">By subject</h3>
          <button
      type="button"
      className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>

        {showTable ? <SubjectTable subjects={data.subjects} /> : <OnTimeBars subjects={data.subjects} />}
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Built only from tasks completed with the focus timer
        {data.timedSessions < data.totalSessions && (
          <> — {data.totalSessions - data.timedSessions} completed without it aren&apos;t counted in timings</>
        )}
        . Durations are what was measured; accuracy figures are estimates and get more
        reliable with more sessions.
      </p>
    </div>
  );
}

/* ── Headline numbers ──────────────────────────────────────────────────────
   Four single values: stat tiles, not a chart. A bar chart of four unrelated
   measures would invite comparison between quantities that share no scale. */
function KpiRow({ data }: { data: Analytics }) {
  const trend =
    data.onTimeTrend === null
      ? null
      : `${data.onTimeTrend > 0 ? "+" : ""}${Math.round(data.onTimeTrend * 100)} pts vs previous 4 weeks`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Sessions logged" value={String(data.totalSessions)} />
      <Tile
        label="Finished on time"
        value={`${Math.round(data.onTimeRate * 100)}%`}
        sub={trend}
        tone={data.onTimeRate >= 0.8 ? "good" : data.onTimeRate >= 0.6 ? "warn" : "bad"}
      />
      <Tile
        label="Estimate accuracy"
        value={data.accuracy === null ? "—" : accuracyLabel(data.accuracy)}
        sub={data.accuracy === null ? "Needs a few more sessions" : null}
      />
      <Tile label="Total study time" value={formatMins(data.totalMinutes)} sub={`avg ${formatMins(data.averageTaskMins)} per task`} />
    </div>
  );
}

function Tile({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string | null; tone?: "good" | "warn" | "bad" }) {
  const toneColor =
    tone === "good" ? "#10b981" : tone === "warn" ? "#f59e0b" : tone === "bad" ? "#ef4444" : "#fff";

  return (
    <div className="card animate-riseIn p-4">
      <div className="text-[10px] uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: toneColor }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-slate-600">{sub}</div>}
    </div>
  );
}

/* ── Study time per week ───────────────────────────────────────────────────
   Trend over time, one measure: columns in a single hue. */
function WeeklyChart({ weeks }: { weeks: WeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(60, ...weeks.map((w) => w.minutes));
  const H = 120;

  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Study time per week</h3>
      <p className="mt-1 text-[11px] text-slate-500">Measured with the focus timer</p>

      <div className="relative mt-5" style={{ height: H + 26 }}>
        {/* Recessive gridlines, hairline and solid */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t"
            style={{ borderColor: GRID, bottom: 26 + f * H }}
          />
        ))}

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-[3px]" style={{ height: H + 26 }}>
          {weeks.map((w, i) => {
            const h = (w.minutes / max) * H;
            const on = hover === i;
            return (
              <div
                key={w.weekStart}
                className="group relative flex flex-1 flex-col justify-end"
                style={{ height: H + 26 }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <motion.div
                  className="mx-auto w-full"
                  initial={{ height: 0 }}
                  whileInView={{ height: Math.max(w.minutes > 0 ? 3 : 0, h) }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.6, ease: EASE_OUT, delay: i * 0.02 }}
                  style={{
                    maxWidth: 24,
                    borderRadius: "4px 4px 0 0",
                    background: on ? RAMP.light : RAMP.base,
                    marginBottom: 26,
                  }}
                />
                <span className="absolute bottom-0 w-full text-center text-[9.5px] text-slate-600">
                  {i % 2 === 0 ? w.label : ""}
                </span>

                {on && w.completed > 0 && (
                  <div
                    className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] shadow-xl"
                    style={{ bottom: h + 34, background: SURFACE, borderColor: "rgba(255,255,255,0.12)" }}
                  >
                    <div className="font-medium text-white">{formatMins(w.minutes)}</div>
                    <div className="text-slate-400">
                      {w.completed} task{w.completed === 1 ? "" : "s"} · {w.onTime} on time
                    </div>
                    <div className="mt-0.5 text-slate-600">week of {w.label}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Estimate vs actual ────────────────────────────────────────────────────
   Before → after per subject: a dumbbell, one hue in two shades. Two bars per
   subject would imply the pair are independent quantities; they're the same
   quantity measured twice, and the gap between them is the story. */
function EstimateAccuracy({ subjects }: { subjects: SubjectStat[] }) {
  const withPairs = subjects.filter((s) => s.estimatedMins > 0 && s.actualMins > 0);
  if (withPairs.length === 0) return null;

  const max = Math.max(...withPairs.flatMap((s) => [s.estimatedMins, s.actualMins]));

  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Estimated vs actual time</h3>
      <p className="mt-1 text-[11px] text-slate-500">Total across all completed tasks, per subject</p>

      {/* Two measures share one scale, so a legend is required. */}
      <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: RAMP.pale }} />
          Estimated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: RAMP.mid }} />
          Actual
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {withPairs.map((s) => {
          const eLeft = (s.estimatedMins / max) * 100;
          const aLeft = (s.actualMins / max) * 100;
          const over = s.actualMins > s.estimatedMins;

          return (
            <div key={s.subject}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] text-slate-300">{s.subject}</span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {formatMins(s.estimatedMins)} → {formatMins(s.actualMins)}
                  {s.accuracy !== null && (
                    <span className={over ? " text-amber-300/90" : " text-emerald-300/90"}>
                      {" "}({accuracyLabel(s.accuracy)})
                    </span>
                  )}
                </span>
              </div>

              <div className="relative h-3">
                {/* Connector carries the magnitude of the gap */}
                <div
                  className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
                  style={{
                    left: `${Math.min(eLeft, aLeft)}%`,
                    width: `${Math.abs(aLeft - eLeft)}%`,
                    background: "rgba(255,255,255,0.16)",
                  }}
                />
                {/* 2px surface ring keeps the dots legible where they overlap */}
                <Dot left={eLeft} color={RAMP.pale} />
                <Dot left={aLeft} color={RAMP.mid} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Dot({ left, color }: { left: number; color: string }) {
  return (
    <motion.span
      className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
      style={{ left: `${left}%`, x: "-50%", background: color, boxShadow: `0 0 0 2px ${SURFACE}` }}
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    />
  );
}

/* ── On-time rate by subject ───────────────────────────────────────────────
   Magnitude comparison, one measure: bars in a single hue. */
function OnTimeBars({ subjects }: { subjects: SubjectStat[] }) {
  return (
    <div className="mt-5 space-y-3">
      {subjects.map((s) => (
        <div key={s.subject} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[12.5px] text-slate-300">{s.subject}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-[4px] bg-white/[0.04]">
            <motion.div
              className="h-full"
              initial={{ width: 0 }}
              whileInView={{ width: `${Math.max(2, s.onTimeRate * 100)}%` }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease: EASE_OUT }}
              style={{ background: RAMP.base, borderRadius: "0 4px 4px 0" }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
            {Math.round(s.onTimeRate * 100)}% · {s.sessions}
            {s.sessions < 4 && <span className="text-slate-600"> ·  few</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Table view — nothing in the charts is gated behind colour or hover. */
function SubjectTable({ subjects }: { subjects: SubjectStat[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-slate-500">
            <th className="py-2 pr-3 font-medium">Subject</th>
            <th className="py-2 pr-3 font-medium">Sessions</th>
            <th className="py-2 pr-3 font-medium">Avg time</th>
            <th className="py-2 pr-3 font-medium">On time</th>
            <th className="py-2 font-medium">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.subject} className="border-b border-white/[0.04] text-slate-300">
              <td className="py-2 pr-3">{s.subject}</td>
              <td className="py-2 pr-3 tabular-nums text-slate-400">{s.sessions}</td>
              <td className="py-2 pr-3 tabular-nums text-slate-400">{formatMins(s.averageActualMins)}</td>
              <td className="py-2 pr-3 tabular-nums text-slate-400">{Math.round(s.onTimeRate * 100)}%</td>
              <td className="py-2 tabular-nums text-slate-400">
                {s.accuracy === null ? "—" : accuracyLabel(s.accuracy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMins(m: number): string {
  if (!m) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Express accuracy as over/under rather than a raw ratio nobody can interpret. */
function accuracyLabel(a: number): string {
  const pct = Math.round((a - 1) * 100);
  if (Math.abs(pct) <= 10) return "on target";
  return pct > 0 ? `+${pct}% over` : `${pct}% under`;
}
