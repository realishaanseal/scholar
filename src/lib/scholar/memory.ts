import { db, newId, nowISO } from "../db";
import { DEFAULT_AVAILABILITY, type AvailabilityProfile, type SubjectPace } from "./types";

/**
 * Academic memory: what Scholar has learned about how this student actually works.
 *
 * All aggregates are derived from `task_events` at read time. Nothing is cached
 * in a stats table on purpose — deleting an event has to immediately change what
 * Scholar believes, otherwise "reset my memory" is a lie.
 */

export type TaskEventInput = {
  userId: string;
  homeworkId: string | null;
  subjectName: string;
  estimateMins: number | null;
  actualMins: number | null;
  dueAt: string | null;
  completedAt: string;
  difficulty?: number | null;
};

export async function recordTaskEvent(input: TaskEventInput): Promise<void> {
  const onTime =
    input.dueAt && input.completedAt
      ? new Date(input.completedAt).getTime() <= new Date(input.dueAt).getTime()
        ? 1
        : 0
      : 1;

  await db.prepare(
    `INSERT INTO task_events
       (id, userId, homeworkId, subjectName, estimateMins, actualMins, dueAt, completedAt, onTime, difficulty, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId(), input.userId, input.homeworkId, input.subjectName,
    input.estimateMins, input.actualMins, input.dueAt, input.completedAt,
    onTime, input.difficulty ?? null, nowISO()
  );
}

type PaceRow = {
  subjectName: string;
  n: number;
  avgActual: number | null;
  sumEstimate: number | null;
  sumActual: number | null;
  onTimeCount: number;
};

/**
 * Per-subject pace, keyed by subject name.
 *
 * Only events with BOTH an estimate and an actual contribute to calibration —
 * a task completed without the timer tells us nothing about estimate accuracy,
 * and including it would quietly bias the factor toward 1.
 */
export async function paceBySubject(userId: string): Promise<Record<string, SubjectPace>> {
  // Postgres returns COUNT/SUM/AVG as strings by default (avoids precision
  // loss on bigints); casting to int/float8 here keeps these genuinely numeric
  // the way better-sqlite3's driver always returned them.
  const rows = (await db
    .prepare(
      `SELECT subjectName,
              COUNT(*)::int                                              AS n,
              AVG(actualMins)::float8                                    AS avgActual,
              SUM(CASE WHEN estimateMins > 0 AND actualMins > 0 THEN estimateMins ELSE 0 END)::int AS sumEstimate,
              SUM(CASE WHEN estimateMins > 0 AND actualMins > 0 THEN actualMins   ELSE 0 END)::int AS sumActual,
              SUM(onTime)::int                                           AS onTimeCount
         FROM task_events
        WHERE userId = ?
        GROUP BY subjectName`
    )
    .all(userId)) as PaceRow[];

  const out: Record<string, SubjectPace> = {};
  for (const r of rows) {
    const sumEstimate = r.sumEstimate ?? 0;
    const sumActual = r.sumActual ?? 0;
    const calibration = sumEstimate > 0 && sumActual > 0 ? sumActual / sumEstimate : 1;

    out[r.subjectName] = {
      subject: r.subjectName,
      // Clamp: one disastrous session shouldn't triple every future estimate.
      calibration: Math.min(3, Math.max(0.5, calibration)),
      averageActualMins: Math.round(r.avgActual ?? 0),
      onTimeRate: r.n > 0 ? r.onTimeCount / r.n : 1,
      sampleSize: r.n,
    };
  }
  return out;
}

export type MemorySnapshot = {
  totalEvents: number;
  subjects: SubjectPace[];
  overallOnTimeRate: number;
  overallCalibration: number;
};

/** Everything Scholar has learned, in a form the student can inspect. */
export async function memorySnapshot(userId: string): Promise<MemorySnapshot> {
  const subjects = Object.values(await paceBySubject(userId));
  const totalEvents = subjects.reduce((n, s) => n + s.sampleSize, 0);

  const weighted = (pick: (s: SubjectPace) => number) =>
    totalEvents > 0
      ? subjects.reduce((acc, s) => acc + pick(s) * s.sampleSize, 0) / totalEvents
      : pick({ calibration: 1, onTimeRate: 1 } as SubjectPace);

  return {
    totalEvents,
    subjects: subjects.sort((a, b) => b.sampleSize - a.sampleSize),
    overallOnTimeRate: totalEvents > 0 ? weighted((s) => s.onTimeRate) : 1,
    overallCalibration: totalEvents > 0 ? weighted((s) => s.calibration) : 1,
  };
}

/** Wipe learned history. The student must be able to actually do this. */
export async function resetMemory(userId: string): Promise<number> {
  return (await db.prepare(`DELETE FROM task_events WHERE userId = ?`).run(userId)).changes;
}

export async function deleteMemoryEvent(userId: string, eventId: string): Promise<boolean> {
  return (await db.prepare(`DELETE FROM task_events WHERE userId = ? AND id = ?`).run(userId, eventId)).changes > 0;
}

export async function getAvailability(userId: string): Promise<AvailabilityProfile> {
  const row = (await db
    .prepare(
      `SELECT weekdayMins, weekendMins, studyStartHour, studyEndHour
         FROM academic_profile WHERE userId = ?`
    )
    .get(userId)) as AvailabilityProfile | undefined;
  return row ?? DEFAULT_AVAILABILITY;
}

export async function setAvailability(userId: string, patch: Partial<AvailabilityProfile>): Promise<AvailabilityProfile> {
  const current = await getAvailability(userId);
  const next: AvailabilityProfile = { ...current, ...patch };

  // Guard rails: an inverted or absurd study window would make every downstream
  // availability calculation nonsense.
  next.weekdayMins = clamp(next.weekdayMins, 0, 16 * 60);
  next.weekendMins = clamp(next.weekendMins, 0, 16 * 60);
  next.studyStartHour = clamp(next.studyStartHour, 0, 23);
  next.studyEndHour = clamp(next.studyEndHour, 1, 24);
  if (next.studyEndHour <= next.studyStartHour) next.studyEndHour = Math.min(24, next.studyStartHour + 1);

  await db.prepare(
    `INSERT INTO academic_profile (userId, weekdayMins, weekendMins, studyStartHour, studyEndHour, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       weekdayMins    = excluded.weekdayMins,
       weekendMins    = excluded.weekendMins,
       studyStartHour = excluded.studyStartHour,
       studyEndHour   = excluded.studyEndHour,
       updatedAt      = excluded.updatedAt`
  ).run(userId, next.weekdayMins, next.weekendMins, next.studyStartHour, next.studyEndHour, nowISO());

  return next;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
