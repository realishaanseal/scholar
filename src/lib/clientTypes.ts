export type SubjectDTO = { id: string; name: string; color: string };

export type TimetableSlotDTO = {
  id: string;
  title: string;
  subjectName: string | null;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  location: string | null;
  teacherName: string | null;
  kind: "class" | "break" | "library" | string;
};

export type HomeworkDTO = {
  /**
   * Set when this task was projected from institutional coursework. The
   * dashboard uses it to link back to the brief — a task reading
   * "PHY101 — Problem set 4" that goes nowhere is the most obvious dead end
   * in the product.
   */
  courseLink?: { assignmentId: string; sectionId: string; courseCode: string } | null;
  id: string;
  title: string;
  details: string;
  rawInput: string;
  source: "text" | "voice" | string;
  dueAt: string | null;
  estimateMins: number | null;
  priority: "low" | "normal" | "high" | string;
  status: "todo" | "doing" | "done" | string;
  aiConfidence: number | null;
  aiNotes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Recorded actual duration once completed, in minutes. */
  actualMins: number | null;
  startedAt: string | null;
  /** Seconds accumulated in Focus Mode. */
  focusSeconds: number;
  subject: SubjectDTO | null;
};

export type DraftHomework = {
  title: string;
  details: string;
  subject: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  estimateMins: number | null;
  rawInput: string;
  source: "text" | "voice";
  aiConfidence: number | null;
  aiNotes: string;
  provider: string;
  degraded: boolean;
  /** Why the configured provider was skipped, when it was. */
  providerError?: string | null;
  /** IDs of files uploaded via /api/attachments, to be linked once homework is saved. */
  attachmentIds?: string[];
};
