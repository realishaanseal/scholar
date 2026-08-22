import { completeJSON, type ImageInput } from "../ai/complete";
import type { AIConfig } from "../ai/types";

/**
 * Syllabus → structured academic data.
 *
 * Extraction only. Turning assessments into a dated study plan is a separate,
 * deterministic step (see planner.ts) — scheduling is arithmetic, and doing it
 * in code rather than in the model makes it predictable and testable.
 */

export type SyllabusAssessment = {
  title: string;
  kind: "exam" | "assignment" | "quiz" | "project" | "presentation" | "other";
  dueAt: string | null;
  weightPercent: number | null;
  topics: string[];
};

export type SyllabusTopic = {
  title: string;
  /** Chapter or unit reference as printed, e.g. "Ch. 4". */
  reference: string | null;
};

export type ParsedSyllabus = {
  course: string;
  subject: string;
  term: string | null;
  topics: SyllabusTopic[];
  assessments: SyllabusAssessment[];
  gradingNotes: string;
  confidence: number;
  notes: string;
};

const SYSTEM = `You extract structured course data from a syllabus or course outline.

Return ONLY a JSON object with this exact shape:
{
  "course": string,           // course name as printed, e.g. "IB Physics HL"
  "subject": string,          // single subject name, e.g. "Physics"
  "term": string | null,      // e.g. "Autumn 2026", if stated
  "topics": [ { "title": string, "reference": string|null } ],   // syllabus units in teaching order, max 40
  "assessments": [
    {
      "title": string,
      "kind": "exam"|"assignment"|"quiz"|"project"|"presentation"|"other",
      "dueAt": string|null,          // ISO 8601, null if no date is stated
      "weightPercent": number|null,  // grade weighting if stated
      "topics": string[]             // topics this assessment covers, max 10
    }
  ],
  "gradingNotes": string,     // how the course is graded, one or two sentences
  "confidence": number,       // 0..1
  "notes": string             // anything ambiguous, one short sentence
}

Rules:
- Extract only what the syllabus states. Never invent dates or weightings.
- Preserve the order topics are taught in.
- If a date has no year, infer it from the term and the current date, choosing the nearest sensible future date.
- Return an empty array rather than guessing when a section is absent.`;

export async function parseSyllabus(
  content: { text?: string; image?: ImageInput | null },
  context: { nowISO: string; timezone: string },
  cfg: AIConfig
): Promise<ParsedSyllabus> {
  const user = [
    `Current date and time: ${context.nowISO} (timezone ${context.timezone})`,
    "",
    content.image ? "Read the attached image of a syllabus." : "Syllabus contents:",
    content.text ? `"""\n${content.text}\n"""` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await completeJSON<any>(cfg, {
    system: SYSTEM,
    user,
    image: content.image ?? null,
    maxTokens: 8192,
  });

  return normaliseSyllabus(raw);
}

const KINDS = new Set(["exam", "assignment", "quiz", "project", "presentation", "other"]);

export function normaliseSyllabus(obj: any): ParsedSyllabus {
  return {
    course: str(obj?.course, 120) || "Untitled course",
    subject: str(obj?.subject, 40) || "General",
    term: str(obj?.term, 60) || null,
    topics: Array.isArray(obj?.topics)
      ? obj.topics
          .slice(0, 40)
          .map((t: any) => ({
            title: str(typeof t === "string" ? t : t?.title, 120),
            reference: str(typeof t === "object" ? t?.reference : null, 40) || null,
          }))
          .filter((t: SyllabusTopic) => t.title.length > 0)
      : [],
    assessments: Array.isArray(obj?.assessments)
      ? obj.assessments
          .slice(0, 40)
          .map((a: any) => ({
            title: str(a?.title, 140),
            kind: KINDS.has(a?.kind) ? a.kind : "other",
            dueAt: isoOrNull(a?.dueAt),
            weightPercent: numOrNull(a?.weightPercent, 0, 100),
            topics: Array.isArray(a?.topics)
              ? a.topics.map((x: any) => str(x, 80)).filter(Boolean).slice(0, 10)
              : [],
          }))
          .filter((a: SyllabusAssessment) => a.title.length > 0)
      : [],
    gradingNotes: str(obj?.gradingNotes, 600),
    confidence: clamp01(Number(obj?.confidence)),
    notes: str(obj?.notes, 300),
  };
}

function str(v: any, max: number): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().slice(0, max);
}

function numOrNull(v: any, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isoOrNull(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2000 || year > 2100) return null;
  return d.toISOString();
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
