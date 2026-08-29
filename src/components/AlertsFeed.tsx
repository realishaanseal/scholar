"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SOFT } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";

export type RiskSignal = {
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string | null;
  taskIds: string[];
  key: string;
};

const SEVERITY: Record<string, { accent: string; label: string }> = {
  high: { accent: "#ef4444", label: "Needs attention" },
  medium: { accent: "#f59e0b", label: "Worth a look" },
  low: { accent: "#64748b", label: "For information" },
};

/**
 * Alerts derived from risk detection.
 *
 * Each carries the numbers behind it and a single action, because a warning the
 * student can't act on is just noise with a colour. Dismissal is per-situation,
 * not per-message: if the situation genuinely changes, it speaks again.
 */
export default function AlertsFeed({ onAction }: { onAction?: (signal: RiskSignal) => void }) {
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data } = await fetchJson<{ signals: RiskSignal[] }>(
      `/api/scholar/signals?now=${encodeURIComponent(new Date().toISOString())}`
    );
    if (data) setSignals(data.signals ?? []);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  async function dismiss(key: string) {
    setSignals((prev) => prev.filter((s) => s.key !== key));
    await fetchJson("/api/scholar/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismiss: key }),
    });
  }

  if (!loaded || signals.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={true}>
      {signals.slice(0, 4).map((s, i) => {
        const tone = SEVERITY[s.severity] ?? SEVERITY.low;
        return (
          <motion.div
            key={s.key}
            layout
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { ...SPRING_SOFT, delay: i * 0.06 } }}
            exit={{ opacity: 0, x: 40, filter: "blur(4px)", transition: { duration: 0.25, ease: EASE_OUT } }}
            className="card relative overflow-hidden p-4"
            style={{ borderColor: `${tone.accent}33` }}
          >
            <span
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ background: tone.accent }}
              aria-hidden
            />

            <div className="flex items-start gap-3 pl-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ background: `${tone.accent}1f`, color: tone.accent }}
                  >
                    {tone.label}
                  </span>
                  <h3 className="text-[13.5px] font-medium text-white">{s.title}</h3>
                </div>

                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{s.detail}</p>

                {s.action && (
                  <button
                    onClick={() => onAction?.(s)}
                    className="tap-tall mt-2.5 text-[11.5px] font-medium transition-colors"
                    style={{ color: tone.accent }}
                  >
                    {s.action} →
                  </button>
                )}
              </div>

              <button
                onClick={() => dismiss(s.key)}
                className="tap-44 shrink-0 rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                aria-label="Dismiss"
                title="Dismiss"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
