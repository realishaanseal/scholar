import { db } from "../db";
import { listHomework } from "../queries";
import { getAvailability, paceBySubject } from "./memory";
import { detectRisks, type RiskSignal } from "./detect";
import { dismissedKeys, filterSignals, getNotifyPrefs } from "./notifications";
import { whatShouldIDoNow, type NowContext } from "./recommend";
import { analyseWorkload, rankByRisk, type WorkloadSummary } from "./workload";
import type { AvailabilityProfile, ScorableTask, SubjectPace, TaskRisk } from "./types";
import type { HomeworkDTO } from "../clientTypes";

/**
 * One place that assembles the student's full academic state.
 *
 * The coach, the dashboard, and the notification feed must all reason about the
 * same numbers — if each rebuilt its own view, the coach could recommend a task
 * the dashboard ranked differently, which reads as the app contradicting itself.
 */

export type ClassSlot = {
  id: string;
  title: string;
  subjectName: string | null;
  dayOfWeek: number;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  location: string | null;
};

export type Snapshot = {
  now: Date;
  profile: AvailabilityProfile;
  homework: HomeworkDTO[];
  tasks: ScorableTask[];
  risks: Record<string, TaskRisk>;
  workload: WorkloadSummary;
  recommendation: NowContext;
  /** Signals after preference filtering and dismissal. */
  signals: RiskSignal[];
  /** Everything detected, before filtering — the settings UI needs the raw view. */
  allSignals: RiskSignal[];
  pace: Record<string, SubjectPace>;
  timetable: ClassSlot[];
  classesToday: ClassSlot[];
};

export function toScorable(h: HomeworkDTO): ScorableTask {
  return {
    id: h.id,
    title: h.title,
    status: h.status,
    dueAt: h.dueAt,
    estimateMins: h.estimateMins,
    priority: h.priority,
    subject: h.subject?.name ?? "General",
    focusMins: Math.round((h.focusSeconds ?? 0) / 60),
  };
}

export async function buildSnapshot(
  userId: string,
  options: { now?: Date; availableMinsOverride?: number | null } = {}
): Promise<Snapshot> {
  const now = options.now ?? new Date();
  const profile = await getAvailability(userId);
  const pace = await paceBySubject(userId);
  const homework = await listHomework(userId);
  const tasks = homework.map(toScorable);

  const history = (await db
    .prepare(
      `SELECT subjectName, estimateMins, actualMins, onTime, completedAt
         FROM task_events WHERE userId = ? ORDER BY completedAt DESC LIMIT 100`
    )
    .all(userId)) as Array<{
      subjectName: string; estimateMins: number | null; actualMins: number | null;
      onTime: number; completedAt: string;
    }>;

  const timetable = (await db
    .prepare(
      `SELECT id, title, subjectName, dayOfWeek, startHour, startMin, endHour, endMin, location
         FROM timetable WHERE userId = ? ORDER BY dayOfWeek, startHour, startMin`
    )
    .all(userId)) as ClassSlot[];

  const risks: Record<string, TaskRisk> = {};
  for (const { task, risk } of rankByRisk(tasks, { now, profile, paceBySubject: pace })) {
    risks[task.id] = risk;
  }

  const allSignals = detectRisks(tasks, { now, profile, paceBySubject: pace, history });
  const signals = filterSignals(allSignals, await getNotifyPrefs(userId), await dismissedKeys(userId));

  return {
    now,
    profile,
    homework,
    tasks,
    risks,
    workload: analyseWorkload(tasks, { now, profile, paceBySubject: pace }),
    recommendation: whatShouldIDoNow(tasks, {
      now,
      profile,
      paceBySubject: pace,
      availableMinsOverride: options.availableMinsOverride ?? null,
    }),
    signals,
    allSignals,
    pace,
    timetable,
    classesToday: timetable.filter((c) => c.dayOfWeek === now.getDay()),
  };
}
