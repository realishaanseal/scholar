/** Shared types for the Scholar intelligence layer (priority, workload, recommendation). */

export type RiskLevel = "critical" | "high" | "moderate" | "low" | "none";

export type AvailabilityProfile = {
  /** Minutes of study time on a typical working day. */
  weekdayMins: number;
  /** Minutes of study time on a typical rest day. */
  weekendMins: number;
  /** Hour (0-23) the student typically starts studying. */
  studyStartHour: number;
  /** Hour (0-23) the student typically stops. */
  studyEndHour: number;
  /**
   * Which days are rest days, 0 = Sunday through 6 = Saturday.
   *
   * Data rather than an assumption, because the weekend is Friday-Saturday
   * across much of the Middle East and Sunday-only in parts of South Asia.
   * Hardcoding Saturday-Sunday made the planner allocate study time on school
   * days and demand work on days off, and do it with a straight face.
   */
  restDays: number[];
  /**
   * IANA zone this student keeps their own hours in. Null means "wherever
   * their institution is", which is true of almost everyone.
   */
  timezone: string | null;
};

export const DEFAULT_AVAILABILITY: AvailabilityProfile = {
  weekdayMins: 120,
  weekendMins: 240,
  studyStartHour: 16,
  studyEndHour: 22,
  // Saturday and Sunday, which is the majority case and the behaviour every
  // existing row already had. Wrong for a large minority, which is why it is
  // now a default rather than a law.
  restDays: [0, 6],
  timezone: null,
};

/** Per-subject historical behaviour, derived from completed task events. */
export type SubjectPace = {
  subject: string;
  /** How much longer tasks actually take than estimated. 1.0 = estimates are accurate. */
  calibration: number;
  /** Mean actual duration in minutes. */
  averageActualMins: number;
  /** Fraction of tasks finished on or before the due date, 0-1. */
  onTimeRate: number;
  /** How many completed tasks this is based on. Low counts mean low confidence. */
  sampleSize: number;
};

/** The minimum a task must expose to be scored. Keeps the engine decoupled from the DTO. */
export type ScorableTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  estimateMins: number | null;
  priority: string;
  subject: string;
  /** Minutes already spent in Focus Mode. */
  focusMins?: number;
};

export type TaskRisk = {
  level: RiskLevel;
  /** 0-100. Higher means more attention needed. Used for ordering. */
  score: number;
  /** Effort still expected, after calibration and time already spent. */
  remainingMins: number;
  /** Realistic study minutes between now and the deadline. */
  availableMins: number;
  /** Plain-language explanation of why this task scored the way it did. */
  reason: string;
  /** Latest date the student can start and still finish comfortably. */
  recommendedStart: Date | null;
};
