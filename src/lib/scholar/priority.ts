import { availableMinutesBefore } from "./availability";
import {
  DEFAULT_AVAILABILITY,
  type AvailabilityProfile,
  type RiskLevel,
  type ScorableTask,
  type SubjectPace,
  type TaskRisk,
} from "./types";

const MS_PER_MIN = 60_000;

/** Fallback effort when the AI didn't produce an estimate. Deliberately modest. */
const DEFAULT_ESTIMATE_MINS = 40;

/**
 * How much of a subject's historical calibration to trust, given how few
 * completed tasks it's based on. One data point should nudge, not dictate.
 */
function calibrationWeight(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return Math.min(1, sampleSize / 5);
}

/**
 * Expected remaining effort in minutes, adjusted for the fact that students
 * systematically under-estimate — and for time already logged in Focus Mode.
 */
export function expectedRemainingMins(task: ScorableTask, pace?: SubjectPace): number {
  const base = task.estimateMins && task.estimateMins > 0 ? task.estimateMins : DEFAULT_ESTIMATE_MINS;

  let adjusted = base;
  if (pace && pace.sampleSize > 0 && pace.calibration > 0) {
    const w = calibrationWeight(pace.sampleSize);
    // Blend toward the historical calibration factor rather than applying it raw.
    adjusted = base * (1 + (pace.calibration - 1) * w);
  }

  const spent = task.focusMins ?? 0;
  return Math.max(0, Math.round(adjusted - spent));
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Score a single task's risk.
 *
 * The central idea: urgency is not deadline proximity alone, it's the ratio of
 * work remaining to time actually available to do it. A 4-hour task due
 * tomorrow can be in worse shape than an overdue 5-minute one, and the returned
 * `reason` always states which of those situations the student is in.
 */
export function assessRisk(
  task: ScorableTask,
  options: {
    now?: Date;
    profile?: AvailabilityProfile;
    pace?: SubjectPace;
  } = {}
): TaskRisk {
  const now = options.now ?? new Date();
  const profile = options.profile ?? DEFAULT_AVAILABILITY;
  const pace = options.pace;

  const remainingMins = expectedRemainingMins(task, pace);

  if (task.status === "done") {
    return {
      level: "none", score: 0, remainingMins: 0, availableMins: 0,
      reason: "Completed.", recommendedStart: null,
    };
  }

  if (!task.dueAt) {
    // No deadline means no time pressure, but the work still exists. Manual
    // priority is the only signal available, so it's the only one used.
    const score = task.priority === "high" ? 30 : task.priority === "low" ? 5 : 15;
    return {
      level: "low", score, remainingMins, availableMins: 0,
      reason: `No deadline set. About ${formatMins(remainingMins)} of work.`,
      recommendedStart: null,
    };
  }

  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) {
    return {
      level: "low", score: 10, remainingMins, availableMins: 0,
      reason: "Deadline couldn't be read.", recommendedStart: null,
    };
  }

  const overdue = due.getTime() < now.getTime();
  const availableMins = overdue ? 0 : availableMinutesBefore(due, profile, now);

  if (overdue) {
    const daysLate = Math.max(1, Math.round((now.getTime() - due.getTime()) / (24 * 60 * MS_PER_MIN)));
    return {
      level: "critical",
      score: 100,
      remainingMins,
      availableMins: 0,
      reason: `Overdue by ${daysLate} day${daysLate === 1 ? "" : "s"}, with about ${formatMins(remainingMins)} of work left.`,
      recommendedStart: now,
    };
  }

  // Pressure ratio: >1 means there is literally not enough study time left.
  const ratio = availableMins > 0 ? remainingMins / availableMins : remainingMins > 0 ? 99 : 0;

  let score: number;
  let reason: string;

  if (ratio >= 1) {
    score = 95;
    reason = `Not enough time left — about ${formatMins(remainingMins)} of work but only ${formatMins(availableMins)} of study time before the deadline.`;
  } else if (ratio >= 0.7) {
    score = 75;
    reason = `Tight — about ${formatMins(remainingMins)} of work against ${formatMins(availableMins)} of study time. Very little slack.`;
  } else if (ratio >= 0.4) {
    score = 55;
    reason = `Manageable, but start soon — ${formatMins(remainingMins)} of work with ${formatMins(availableMins)} available.`;
  } else if (ratio >= 0.2) {
    score = 32;
    reason = `Comfortable — ${formatMins(remainingMins)} of work, ${formatMins(availableMins)} of study time available.`;
  } else {
    score = 14;
    reason = `Plenty of time — ${formatMins(remainingMins)} of work with ${formatMins(availableMins)} available.`;
  }

  // A high-priority or graded task deserves a nudge, but must not overwhelm the
  // time-based signal — otherwise everything marked "high" looks equally urgent.
  if (task.priority === "high") score = Math.min(99, score + 8);
  if (task.priority === "low") score = Math.max(0, score - 8);

  // Falling behind the subject's own history is worth flagging explicitly.
  if (pace && pace.sampleSize >= 3 && pace.onTimeRate < 0.7) {
    score = Math.min(99, score + 5);
    reason += ` You've been late on ${Math.round((1 - pace.onTimeRate) * 100)}% of ${pace.subject} tasks.`;
  }

  // Work backward from the deadline: when must this start to stay comfortable?
  const recommendedStart = backwardStart(due, remainingMins, profile, now);

  return {
    level: levelFromScore(score),
    score,
    remainingMins,
    availableMins,
    reason,
    recommendedStart,
  };
}

/**
 * Latest start date that still leaves ~1.5x the expected effort in study time —
 * the buffer is what turns "technically possible" into "actually comfortable".
 */
function backwardStart(
  due: Date,
  remainingMins: number,
  profile: AvailabilityProfile,
  now: Date
): Date | null {
  const needed = remainingMins * 1.5;
  const cursor = new Date(due);

  for (let i = 0; i < 60; i++) {
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getTime() <= now.getTime()) return now;
    if (availableMinutesBefore(due, profile, cursor) >= needed) continue;
    // Stepped one day too far — the previous day was the last comfortable start.
    const start = new Date(cursor);
    start.setDate(start.getDate() + 1);
    return start.getTime() <= now.getTime() ? now : start;
  }
  return null;
}

export const RISK_STYLES: Record<RiskLevel, { label: string; text: string; bg: string; ring: string }> = {
  critical: { label: "Critical",  text: "text-red-300",    bg: "bg-red-500/[0.12]",    ring: "border-red-500/30" },
  high:     { label: "At risk",   text: "text-orange-300", bg: "bg-orange-500/[0.12]", ring: "border-orange-500/30" },
  moderate: { label: "Watch",     text: "text-amber-300",  bg: "bg-amber-500/[0.10]",  ring: "border-amber-500/25" },
  low:      { label: "On track",  text: "text-emerald-300",bg: "bg-emerald-500/[0.08]",ring: "border-emerald-500/20" },
  none:     { label: "Done",      text: "text-slate-500",  bg: "bg-white/[0.035]",     ring: "border-white/[0.08]" },
};

export { formatMins };
