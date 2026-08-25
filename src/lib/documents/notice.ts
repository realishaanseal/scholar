import { completeJSON } from "../ai/complete";
import type { AIConfig } from "../ai/types";

/**
 * School notice / diary email → structured homework candidates.
 *
 * Built for the large tier of Indian (and other) school ERP platforms —
 * Shikshak-style products, Entab, Fedena, Teachmint, and the many
 * white-labeled "school diary" apps — that don't expose a public API or an
 * ICS calendar feed the way Canvas/Moodle/Classroom do. What almost all of
 * them DO produce is a homework/diary notice sent to the parent by email
 * (or copy-pasted from the parent portal). Rather than building a fragile,
 * per-vendor scraper against a login-gated portal, this reads whatever text
 * the student/parent pastes — the email body, forwarded as plain text — and
 * extracts the same shape of candidate the ICS importer produces, so it
 * flows into the exact same review-and-commit UI.
 *
 * One notice commonly lists several subjects' homework at once ("Maths: pg
 * 42 Q1-10. Science: read Ch.3. English: essay due Friday.") — this is a
 * multi-item extraction, not a single-assignment one, which is why it's a
 * separate module from documents/assignment.ts rather than a reuse of it.
 */

export type NoticeItem = {
  title: string;
  subject: string;
  /** ISO date/datetime, or null if the notice genuinely doesn't state one. */
  dueAt: string | null;
  details: string;
};

export type NoticeExtraction = {
  items: NoticeItem[];
  warnings: string[];
};

const SYSTEM = `You read a school notice, homework diary entry, or parent-portal email and pull out each separate piece of homework or coursework mentioned.

One notice often covers several subjects at once — treat each subject's task as its own item, not one combined item.

Return ONLY a JSON object with this exact shape:
{
  "items": [
    {
      "title": "string — short task name, e.g. 'Workbook pg 42, Q1-10' or 'Read Chapter 3'",
      "subject": "string — the school subject this belongs to, e.g. 'Mathematics'",
      "dueAt": "string|null — ISO 8601 date/datetime if the notice states or clearly implies one (e.g. 'submit tomorrow', 'due Friday'), otherwise null",
      "details": "string — any extra instruction or context worth keeping, empty string if none"
    }
  ],
  "warnings": ["string — anything in the notice you couldn't confidently turn into a task, and why"]
}

Rules:
- Only extract genuine homework/coursework/assignments — skip general announcements, holiday notices, fee reminders, event notices, and attendance messages entirely.
- Resolve relative dates ("tomorrow", "by Friday") against the current date given below. If no date is stated or implied anywhere, use null — never invent one.
- Keep each title short and specific; put the longer instruction in "details".
- Return valid JSON only. No markdown fence, no commentary.`;

function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function isoOrNull(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  // Same absurd-date guard as the assignment extractor: a model that returns
  // a date decades off has misread something, and no date beats a wrong one.
  if (year < 2000 || year > 2100) return null;
  return d.toISOString();
}

/** Validates the model's items the same way every other extractor here does
 *  — a malformed row becomes a warning, never a silent drop. */
export function sanitiseNoticeItems(raw: any): NoticeExtraction {
  const warnings: string[] = Array.isArray(raw?.warnings)
    ? raw.warnings.filter((w: unknown) => typeof w === "string").slice(0, 20)
    : [];

  const items: NoticeItem[] = [];
  const rows = Array.isArray(raw?.items) ? raw.items : [];

  for (const r of rows) {
    const title = str(r?.title, 160);
    if (!title) {
      warnings.push("Skipped a row with no identifiable task.");
      continue;
    }
    items.push({
      title,
      subject: str(r?.subject, 40) || "General",
      dueAt: isoOrNull(r?.dueAt),
      details: str(r?.details, 1000),
    });
  }

  return { items: items.slice(0, 60), warnings: warnings.slice(0, 20) };
}

export async function extractNoticeItems(
  cfg: AIConfig,
  input: { text: string; nowISO: string }
): Promise<NoticeExtraction> {
  const user = `Current date: ${input.nowISO}\n\nNotice text:\n"""\n${input.text.trim().slice(0, 12000)}\n"""`;

  const raw = await completeJSON<any>(cfg, {
    system: SYSTEM,
    user,
    maxTokens: 3000,
  });

  return sanitiseNoticeItems(raw);
}

/**
 * A stable id for a text-extracted item, so pasting the same notice twice
 * updates the existing task instead of duplicating it — the same job the
 * ICS UID does for the calendar-feed importer, which has no UID to reuse
 * here since the source is free text, not a calendar object.
 */
export function noticeExternalId(item: NoticeItem): string {
  const key = `${item.title.toLowerCase()}|${item.subject.toLowerCase()}|${item.dueAt ?? "none"}`;
  // A short non-cryptographic hash is enough — this only needs to be stable
  // and collision-unlikely for one student's own items, not adversarial.
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return `text-${(hash >>> 0).toString(36)}`;
}
