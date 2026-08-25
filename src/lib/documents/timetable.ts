import { completeJSON, type ImageInput } from "../ai/complete";
import type { AIConfig } from "../ai/types";

/**
 * Free-form timetable → structured class slots.
 *
 * Extraction only, exactly like syllabus.ts: the model reads whatever shape
 * the school gave the student (a pasted grid, a photo of a printout, a wall
 * of "Mon P1 Maths R12") and returns rows. Validation, clamping and overlap
 * checks are done in code afterwards — those are rules, not judgement, and
 * they should behave identically no matter which provider is configured.
 */

export type ParsedClass = {
  title: string;
  subjectName: string | null;
  /** 0 = Sunday, matching the existing `timetable.dayOfWeek` column. */
  dayOfWeek: number;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  location: string | null;
  /** Who teaches it, if the source says so. Powers the "Classes" live view. */
  teacherName: string | null;
};

export type ParsedTimetable = {
  classes: ParsedClass[];
  /** Anything the model couldn't place — surfaced so the student can fix it. */
  warnings: string[];
  notes: string;
};

const SYSTEM = `You convert a student's class timetable into structured JSON.

The input may be a pasted grid, a list, an exported schedule, or a photo of a
printed timetable. Layouts vary wildly between schools — read it carefully.

Return ONLY a JSON object with this exact shape:
{
  "classes": [
    {
      "title": "string — what to call this class, e.g. 'Mathematics' or 'Physics Lab'",
      "subjectName": "string|null — the bare subject if the title has extra words",
      "dayOfWeek": 0-6,
      "startHour": 0-23,
      "startMin": 0-59,
      "endHour": 0-23,
      "endMin": 0-59,
      "location": "string|null — room or building if given",
      "teacherName": "string|null — the teacher/instructor's name if the source states one, otherwise null. Never guess or invent one."
    }
  ],
  "warnings": ["string — rows you could not confidently place, and why"],
  "notes": "string — one short sentence on how you read the layout"
}

Rules:
- dayOfWeek: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.
- Use 24-hour time. "1:30" in an afternoon column is 13:30. Infer am/pm from
  the surrounding rows — school days run roughly 07:00–18:00.
- If a period number maps to a time elsewhere in the input (a "P1 = 08:40"
  key, or a header row of times), resolve it and emit the real time.
- Emit one object per class per day. A class that meets Monday and Thursday
  is two objects, not one.
- Skip breaks, lunch, registration, free periods and study halls entirely.
- If a row's time or day is genuinely unreadable, leave it out of "classes"
  and describe it in "warnings" instead. Never invent a time to fill a gap.
- Every class must have endTime after startTime.
- Return valid JSON only. No markdown fence, no commentary.`;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= lo && i <= hi ? i : null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Validates the model's rows against the same constraints the API enforces,
 * so nothing reaches the review screen that would be rejected on save. A row
 * that fails becomes a warning rather than being silently dropped — a student
 * who pasted 30 classes and got 27 back deserves to know which three vanished.
 */
export function sanitiseClasses(raw: any): ParsedTimetable {
  const warnings: string[] = Array.isArray(raw?.warnings)
    ? raw.warnings.filter((w: unknown) => typeof w === "string").slice(0, 20)
    : [];

  const classes: ParsedClass[] = [];
  const rows = Array.isArray(raw?.classes) ? raw.classes : [];

  for (const r of rows) {
    const title = str(r?.title, 80);
    const dayOfWeek = clampInt(r?.dayOfWeek, 0, 6);
    const startHour = clampInt(r?.startHour, 0, 23);
    const endHour = clampInt(r?.endHour, 0, 23);
    const startMin = clampInt(r?.startMin, 0, 59) ?? 0;
    const endMin = clampInt(r?.endMin, 0, 59) ?? 0;

    if (!title || dayOfWeek === null || startHour === null || endHour === null) {
      warnings.push(`Skipped a row that was missing a title, day or time${title ? ` ("${title}")` : ""}.`);
      continue;
    }
    if (endHour * 60 + endMin <= startHour * 60 + startMin) {
      warnings.push(`Skipped "${title}" on ${DAY_NAMES[dayOfWeek]} — it ends before it starts.`);
      continue;
    }

    classes.push({
      title,
      subjectName: str(r?.subjectName, 40),
      dayOfWeek,
      startHour,
      startMin,
      endHour,
      endMin,
      location: str(r?.location, 80),
      teacherName: str(r?.teacherName, 60),
    });
  }

  // Stable order so the review list reads like a week, not like model output.
  classes.sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin)
  );

  // Exact duplicates are common when a grid repeats a class in merged cells.
  const seen = new Set<string>();
  const deduped = classes.filter((c) => {
    const key = `${c.dayOfWeek}|${c.startHour}:${c.startMin}|${c.endHour}:${c.endMin}|${c.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    classes: deduped,
    warnings: warnings.slice(0, 20),
    notes: str(raw?.notes, 300) ?? "",
  };
}

export async function parseTimetable(
  cfg: AIConfig,
  input: { text?: string; image?: ImageInput | null }
): Promise<ParsedTimetable> {
  const user = input.image
    ? `Read the timetable in this image and return the JSON described above.${
        input.text?.trim() ? `\n\nThe student also added this context:\n${input.text.trim()}` : ""
      }`
    : `Convert this timetable into the JSON described above:\n\n${input.text?.trim() ?? ""}`;

  const raw = await completeJSON<any>(cfg, {
    system: SYSTEM,
    user,
    image: input.image ?? null,
    // A full week of classes is a long array; the task-parsing ceiling is too low.
    maxTokens: 4000,
  });

  return sanitiseClasses(raw);
}
