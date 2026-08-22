import { db, newId, nowISO } from "../db";
import { DEFAULT_AVAILABILITY, type AvailabilityProfile, type SubjectPace } from "./types";

/**
 * Academic memory: what Scholar has learned about how this student actually works.
 *
 * All aggregates are derived from `taskEvents` at read time. Nothing is cached
 * in a stats doc on purpose — deleting an event has to immediately change what
 * Scholar believes, otherwise "reset my memory" is a lie.
 *
 * Firestore has no server-side GROUP BY, so `paceBySubject` fetches every event
 * for the user and aggregates in JS. That's fine at the scale one student's
 * completed-task history reaches — this is not a query over other people's data.
 */

function taskEventsCol(userId: string) {
  return db.collection("users").doc(userId).collection("taskEvents");
}
function academicProfileDoc(userId: string) {
  return db.collection("users").doc(userId).collection("settings").doc("academicProfile");
}

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

  await taskEventsCol(input.userId).doc(newId()).set({
    homeworkId: input.homeworkId,
    subjectName: input.subjectName,
    estimateMins: input.estimateMins,
    actualMins: input.actualMins,
    dueAt: input.dueAt,
    completedAt: input.completedAt,
    onTime,
    difficulty: input.difficulty ?? null,
    createdAt: nowISO(),
  });
}

type TaskEventDoc = {
  subjectName: string;
  estimateMins: number | null;
  actualMins: number | null;
  onTime: number;
  completedAt: string;
};

/**
 * Per-subject pace, keyed by subject name.
 *
 * Only events with BOTH an estimate and an actual contribute to calibration —
 * a task completed without the timer tells us nothing about estimate accuracy,
 * and including it would quietly bias the factor toward 1.
 */
export async function paceBySubject(userId: string): Promise<Record<string, SubjectPace>> {
  const snap = await taskEventsCol(userId).get();
  const rows = snap.docs.map((d) => d.data() as TaskEventDoc);

  const bySubject = new Map<string, TaskEventDoc[]>();
  for (const r of rows) {
    const list = bySubject.get(r.subjectName) ?? [];
    list.push(r);
    bySubject.set(r.subjectName, list);
  }

  const out: Record<string, SubjectPace> = {};
  for (const [subjectName, list] of bySubject) {
    const n = list.length;
    const avgActual =
      list.reduce((sum, r) => sum + (r.actualMins ?? 0), 0) / (n || 1);

    let sumEstimate = 0;
    let sumActual = 0;
    let onTimeCount = 0;
    for (const r of list) {
      if ((r.estimateMins ?? 0) > 0 && (r.actualMins ?? 0) > 0) {
        sumEstimate += r.estimateMins!;
        sumActual += r.actualMins!;
      }
      onTimeCount += r.onTime;
    }

    const calibration = sumEstimate > 0 && sumActual > 0 ? sumActual / sumEstimate : 1;

    out[subjectName] = {
      subject: subjectName,
      // Clamp: one disastrous session shouldn't triple every future estimate.
      calibration: Math.min(3, Math.max(0.5, calibration)),
      averageActualMins: Math.round(avgActual),
      onTimeRate: n > 0 ? onTimeCount / n : 1,
      sampleSize: n,
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
  const snap = await taskEventsCol(userId).get();
  if (snap.empty) return 0;

  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  return snap.size;
}

export async function deleteMemoryEvent(userId: string, eventId: string): Promise<boolean> {
  const ref = taskEventsCol(userId).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

export async function getAvailability(userId: string): Promise<AvailabilityProfile> {
  const snap = await academicProfileDoc(userId).get();
  if (!snap.exists) return DEFAULT_AVAILABILITY;

  const data = snap.data() as Partial<AvailabilityProfile>;
  return {
    weekdayMins: data.weekdayMins ?? DEFAULT_AVAILABILITY.weekdayMins,
    weekendMins: data.weekendMins ?? DEFAULT_AVAILABILITY.weekendMins,
    studyStartHour: data.studyStartHour ?? DEFAULT_AVAILABILITY.studyStartHour,
    studyEndHour: data.studyEndHour ?? DEFAULT_AVAILABILITY.studyEndHour,
  };
}

export async function setAvailability(
  userId: string,
  patch: Partial<AvailabilityProfile>
): Promise<AvailabilityProfile> {
  const current = await getAvailability(userId);
  const next: AvailabilityProfile = { ...current, ...patch };

  // Guard rails: an inverted or absurd study window would make every downstream
  // availability calculation nonsense.
  next.weekdayMins = clamp(next.weekdayMins, 0, 16 * 60);
  next.weekendMins = clamp(next.weekendMins, 0, 16 * 60);
  next.studyStartHour = clamp(next.studyStartHour, 0, 23);
  next.studyEndHour = clamp(next.studyEndHour, 1, 24);
  if (next.studyEndHour <= next.studyStartHour) next.studyEndHour = Math.min(24, next.studyStartHour + 1);

  await academicProfileDoc(userId).set(
    {
      weekdayMins: next.weekdayMins,
      weekendMins: next.weekendMins,
      studyStartHour: next.studyStartHour,
      studyEndHour: next.studyEndHour,
      updatedAt: nowISO(),
    },
    { merge: true }
  );

  return next;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
