import { completeJSON, type ImageInput } from "../ai/complete";
import type { AIConfig } from "../ai/types";

/**
 * Assignment Intelligence: read an actual assignment file and pull out what the
 * student would otherwise have to type in themselves.
 *
 * Everything the model returns is validated and clamped here. Model output is
 * treated as a suggestion from an untrusted source, never as data — a
 * hallucinated 40-hour estimate or a 900-item subtask list must not reach the UI.
 */

export type AnalysedAssignment = {
  title: string;
  subject: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  estimateMins: number | null;
  questionCount: number | null;
  topics: string[];
  requirements: string[];
  submissionFormat: string | null;
  graded: boolean | null;
  subtasks: Array<{ title: string; estimateMins: number | null }>;
  details: string;
  confidence: number;
  notes: string;
};

const SYSTEM = `You extract structured academic data from assignment documents.

Return ONLY a JSON object with this exact shape:
{
  "title": string,              // concise task name, e.g. "Physics Assignment 4 — Wave Optics"
  "subject": string,            // single school subject, e.g. "Physics"
  "dueAt": string | null,       // ISO 8601 datetime, or null if the document states no deadline
  "priority": "low"|"normal"|"high",
  "estimateMins": number|null,  // realistic total minutes for a typical student
  "questionCount": number|null,
  "topics": string[],           // specific topics covered, max 10
  "requirements": string[],     // explicit instructions, e.g. "Show all working", max 10
  "submissionFormat": string|null, // e.g. "Handwritten", "PDF upload", "Google Classroom"
  "graded": boolean|null,
  "subtasks": [ { "title": string, "estimateMins": number|null } ], // sensible chunks, max 12
  "details": string,            // 1-3 sentence summary of what must actually be done
  "confidence": number,         // 0..1, how sure you are overall
  "notes": string               // anything ambiguous or assumed, one short sentence
}

Rules:
- Extract only what the document actually says. Never invent a deadline, a grade weighting, or a question count.
- If the document does not state something, use null or an empty array. Do not guess.
- Only split into subtasks when the assignment genuinely has separable parts. An indivisible task gets an empty array.
- Resolve relative dates against the provided current date.`;

export async function analyseAssignment(
  content: { text?: string; image?: ImageInput | null },
  context: { nowISO: string; timezone: string; knownSubjects: string[] },
  cfg: AIConfig
): Promise<AnalysedAssignment> {
  const user = [
    `Current date and time: ${context.nowISO} (timezone ${context.timezone})`,
    context.knownSubjects.length
      ? `The student's existing subjects: ${context.knownSubjects.join(", ")}. Reuse one of these names when it clearly matches.`
      : "",
    "",
    content.image
      ? "Read the attached image of an assignment and extract the structured data."
      : "Assignment document contents:",
    content.text ? `"""\n${content.text}\n"""` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await completeJSON<any>(cfg, {
    system: SYSTEM,
    user,
    image: content.image ?? null,
    maxTokens: 4096,
  });

  return normaliseAssignment(raw, content.text ?? "");
}

const PRIORITIES = new Set(["low", "normal", "high"]);

/** Validate and clamp everything the model returned. Exported so it can be tested directly. */
export function normaliseAssignment(obj: any, fallbackText: string): AnalysedAssignment {
  const title =
    str(obj?.title, 140) ||
    fallbackText.trim().split("\n")[0]?.slice(0, 140) ||
    "Untitled assignment";

  return {
    title,
    subject: str(obj?.subject, 40) || "General",
    dueAt: isoOrNull(obj?.dueAt),
    priority: PRIORITIES.has(obj?.priority) ? obj.priority : "normal",
    // 8h ceiling: a single assignment estimated beyond that is a model error,
    // and an inflated estimate would poison the risk engine downstream.
    estimateMins: intOrNull(obj?.estimateMins, 1, 480),
    questionCount: intOrNull(obj?.questionCount, 1, 500),
    topics: strArray(obj?.topics, 10, 60),
    requirements: strArray(obj?.requirements, 10, 160),
    submissionFormat: str(obj?.submissionFormat, 60) || null,
    graded: typeof obj?.graded === "boolean" ? obj.graded : null,
    subtasks: subtasks(obj?.subtasks),
    details: str(obj?.details, 1200),
    confidence: clamp01(Number(obj?.confidence)),
    notes: str(obj?.notes, 300),
  };
}

function subtasks(value: any): Array<{ title: string; estimateMins: number | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((s: any) => ({
      title: str(typeof s === "string" ? s : s?.title, 120),
      estimateMins: intOrNull(typeof s === "object" ? s?.estimateMins : null, 1, 480),
    }))
    .filter((s) => s.title.length > 0);
}

function str(v: any, max: number): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().slice(0, max);
}

function strArray(v: any, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

function intOrNull(v: any, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min) return null;
  return Math.min(rounded, max);
}

function isoOrNull(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Reject absurd dates outright — a model that returns year 0202 or 2150 has
  // misread something, and a wrong deadline is worse than no deadline.
  const year = d.getFullYear();
  if (year < 2000 || year > 2100) return null;
  return d.toISOString();
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
