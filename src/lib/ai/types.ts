import type { TimetableSlotDTO } from "../clientTypes";

export type ParsedHomework = {
  title: string;
  details: string;
  subject: string;
  dueAt: string | null; // ISO 8601 or null
  priority: "low" | "normal" | "high";
  estimateMins: number | null;
  confidence: number; // 0..1
  notes: string;
};

export type ParseInput = {
  raw: string;
  /** ISO date of "now" on the client, so relative dates resolve in the user's timezone */
  nowISO: string;
  timezone: string;
  /** minutes to ADD to UTC to get the user's local time (e.g. +330 for IST) */
  tzOffsetMinutes: number;
  knownSubjects: string[];
  /** Language guidance, so mixed-language input is understood rather than mangled. */
  languageHint?: string;
  /** A compact, human-readable rendering of the student's upcoming timetable
   *  (see describeScheduleForPrompt), so references like "next chem class",
   *  "next chem lab", or "3rd period tomorrow" resolve against their real
   *  schedule instead of being guessed or dropped. Absent/undefined when the
   *  student has no timetable set up. */
  scheduleContext?: string;
  /** The raw timetable rows, for the offline heuristic parser to match
   *  "next chem class" / "3rd period tomorrow" style phrases directly
   *  (see resolveTimetableReference) without needing an AI model. */
  timetableSlots?: TimetableSlotDTO[];
};

export interface AIProvider {
  name: string;
  available(): boolean;
  parse(input: ParseInput): Promise<ParsedHomework>;
}

/** Runtime AI configuration — resolved per request from user settings, then env. */
export type AIConfig = {
  provider: string;
  apiKey: string | null;
  model: string | null;
  /** Where the config came from, for the UI to explain itself. */
  origin: "user" | "env" | "default";
};
