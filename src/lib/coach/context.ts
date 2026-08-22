import { formatMins } from "../scholar/priority";
import type { RiskSignal } from "../scholar/detect";
import type { NowContext } from "../scholar/recommend";
import type { WorkloadSummary } from "../scholar/workload";
import type { AvailabilityProfile, ScorableTask, SubjectPace, TaskRisk } from "../scholar/types";

/**
 * Serialise the student's real academic state into a compact briefing.
 *
 * This is the entire factual basis the coach is allowed to answer from. It is
 * built here — deterministically, from the database — rather than letting the
 * model query anything, so "never fabricate" is enforced by what the model can
 * see, not merely requested in a prompt.
 */

export type CoachContext = {
  now: Date;
  profile: AvailabilityProfile;
  tasks: ScorableTask[];
  risks: Record<string, TaskRisk>;
  workload: WorkloadSummary;
  recommendation: NowContext;
  signals: RiskSignal[];
  pace: Record<string, SubjectPace>;
  classesToday: Array<{ title: string; startHour: number; startMin: number; endHour: number; endMin: number }>;
};

/** Hard cap on tasks described in full, to keep the prompt bounded. */
const MAX_TASKS = 40;

export function buildBriefing(ctx: CoachContext): string {
  const lines: string[] = [];
  const { now } = ctx;

  lines.push(`CURRENT TIME: ${now.toISOString()} (${now.toLocaleString(undefined, { weekday: "long" })})`);
  lines.push(
    `STUDY WINDOW: ${hour(ctx.profile.studyStartHour)}–${hour(ctx.profile.studyEndHour)}, ` +
      `about ${formatMins(ctx.profile.weekdayMins)} on weekdays and ${formatMins(ctx.profile.weekendMins)} at weekends.`
  );
  lines.push(`TIME LEFT TO STUDY TODAY: ${formatMins(ctx.recommendation.availableNowMins)}`);

  if (ctx.classesToday.length) {
    lines.push(
      `CLASSES TODAY: ${ctx.classesToday
        .map((c) => `${c.title} ${pad(c.startHour)}:${pad(c.startMin)}–${pad(c.endHour)}:${pad(c.endMin)}`)
        .join("; ")}`
    );
  }

  const open = ctx.tasks.filter((t) => t.status !== "done");
  lines.push("");
  lines.push(`OPEN TASKS (${open.length} total${open.length > MAX_TASKS ? `, showing ${MAX_TASKS} most urgent` : ""}):`);

  if (open.length === 0) {
    lines.push("  (none)");
  } else {
    const ordered = [...open].sort(
      (a, b) => (ctx.risks[b.id]?.score ?? 0) - (ctx.risks[a.id]?.score ?? 0)
    );

    for (const t of ordered.slice(0, MAX_TASKS)) {
      const r = ctx.risks[t.id];
      const due = t.dueAt ? new Date(t.dueAt).toISOString() : "no deadline";
      const parts = [
        `  - "${t.title}"`,
        `subject: ${t.subject}`,
        `due: ${due}`,
        `work left: ${formatMins(r?.remainingMins ?? t.estimateMins ?? 0)}`,
      ];
      if (r) {
        parts.push(`risk: ${r.level}`);
        if (r.availableMins > 0) parts.push(`study time before due: ${formatMins(r.availableMins)}`);
      }
      if (t.priority === "high") parts.push("marked high priority");
      lines.push(parts.join(" | "));
    }
  }

  lines.push("");
  lines.push(`WORKLOAD: ${ctx.workload.headline}`);
  const busy = ctx.workload.days.filter((d) => d.workMins > 0).slice(0, 7);
  if (busy.length) {
    lines.push(
      `  Next days: ${busy
        .map((d) => `${d.label} ${formatMins(d.workMins)}${d.overloaded ? " (over capacity)" : ""}`)
        .join(", ")}`
    );
  }

  if (ctx.recommendation.recommendation) {
    const rec = ctx.recommendation.recommendation;
    lines.push("");
    lines.push(
      `SCHOLAR'S CURRENT SUGGESTION: "${rec.task.title}" for ${formatMins(rec.sessionMins)}. ${rec.rationale}`
    );
  }

  if (ctx.signals.length) {
    lines.push("");
    lines.push("ACTIVE WARNINGS:");
    for (const s of ctx.signals.slice(0, 6)) lines.push(`  - [${s.severity}] ${s.title}: ${s.detail}`);
  }

  const paced = Object.values(ctx.pace).filter((p) => p.sampleSize >= 2);
  if (paced.length) {
    lines.push("");
    lines.push("MEASURED HISTORY (from completed timed sessions):");
    for (const p of paced) {
      lines.push(
        `  - ${p.subject}: ${p.sampleSize} sessions, average ${formatMins(p.averageActualMins)}, ` +
          `${Math.round(p.onTimeRate * 100)}% on time, tasks run ${
            p.calibration >= 1
              ? `${Math.round((p.calibration - 1) * 100)}% over`
              : `${Math.round((1 - p.calibration) * 100)}% under`
          } estimate`
      );
    }
  }

  return lines.join("\n");
}

export const COACH_SYSTEM = `You are the study coach inside Varaxis Scholar, an academic organiser.

You are given a briefing describing one student's real academic state: their open tasks, deadlines, workload, study availability, active warnings, and measured history. Answer their questions using that briefing.

Absolute rules:
- Use ONLY facts present in the briefing. Never invent a task, deadline, subject, grade, or number.
- If the briefing does not contain what's needed, say so plainly and suggest what the student could add to Scholar.
- Be concrete. Name actual tasks and cite the actual figures from the briefing.
- Keep answers short — two to five sentences, or a short list. This is a sidebar, not an essay.
- When recommending an order of work, explain the reasoning in one clause (deadline pressure, work remaining, available time).
- You may do arithmetic on the briefing's numbers (totals, whether something fits in the time available).
- Never claim anything about the student's health, stress, or emotional state. Talk about workload and scheduling only.
- Never promise a grade outcome.

Reply in plain prose. Do not use markdown headers. Short lists are fine.`;

function hour(h: number): string {
  if (h === 0 || h === 24) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
