import type { ParsedHomework } from "./types";

/** Strip markdown fences / stray prose and pull the first JSON object out of a model reply. */
export function extractJSON(text: string): any {
  const cleaned = text.replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

const PRIORITIES = new Set(["low", "normal", "high"]);

export function normalizeParsed(obj: any, raw: string): ParsedHomework {
  const title = String(obj?.title ?? "").trim().slice(0, 120) || raw.trim().slice(0, 120) || "Untitled task";
  const priority = PRIORITIES.has(obj?.priority) ? obj.priority : "normal";

  let dueAt: string | null = null;
  if (obj?.dueAt) {
    const d = new Date(obj.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d.toISOString();
  }

  let estimateMins: number | null = null;
  const est = Number(obj?.estimateMins);
  if (Number.isFinite(est) && est > 0) estimateMins = Math.min(Math.round(est), 60 * 24);

  let confidence = Number(obj?.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    title,
    details: String(obj?.details ?? "").trim(),
    subject: String(obj?.subject ?? "General").trim().slice(0, 40) || "General",
    dueAt,
    priority,
    estimateMins,
    confidence,
    notes: String(obj?.notes ?? "").trim(),
  };
}
