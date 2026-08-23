import { db, newId, nowISO } from "./db";
import { recordTaskEvent } from "./scholar/memory";
import type { HomeworkDTO, SubjectDTO } from "./clientTypes";

const PALETTE = [
  "#5b7cfa", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4",
  "#a855f7", "#ef4444", "#14b8a6", "#f97316", "#8b5cf6",
];

type HomeworkRow = {
  id: string; userId: string; subjectId: string | null;
  title: string; details: string; rawInput: string; source: string;
  dueAt: string | null; estimateMins: number | null;
  priority: string; status: string;
  aiConfidence: number | null; aiNotes: string;
  createdAt: string; updatedAt: string; completedAt: string | null;
  actualMins: number | null; startedAt: string | null; focusSeconds: number | null;
  subjectName: string | null; subjectColor: string | null;
};

function toDTO(r: HomeworkRow): HomeworkDTO {
  return {
    id: r.id,
    title: r.title,
    details: r.details,
    rawInput: r.rawInput,
    source: r.source,
    dueAt: r.dueAt,
    estimateMins: r.estimateMins,
    priority: r.priority,
    status: r.status,
    aiConfidence: r.aiConfidence,
    aiNotes: r.aiNotes,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    actualMins: r.actualMins,
    startedAt: r.startedAt,
    focusSeconds: r.focusSeconds ?? 0,
    subject: r.subjectId
      ? { id: r.subjectId, name: r.subjectName ?? "General", color: r.subjectColor ?? "#5b7cfa" }
      : null,
  };
}

/** Find-or-create a subject for this user, assigning a stable colour from the palette. */
export async function ensureSubject(userId: string, rawName: string): Promise<SubjectDTO> {
  const name = (rawName || "General").trim().slice(0, 40) || "General";

  // Case-insensitive match (SQLite's COLLATE NOCASE -> Postgres's LOWER()).
  const existing = (await db
    .prepare(`SELECT id, name, color FROM subjects WHERE userId = ? AND LOWER(name) = LOWER(?)`)
    .get(userId, name)) as SubjectDTO | undefined;
  if (existing) return existing;

  const { c } = (await db.prepare(`SELECT COUNT(*)::int AS c FROM subjects WHERE userId = ?`).get(userId)) as { c: number };
  const subject: SubjectDTO = { id: newId(), name, color: PALETTE[c % PALETTE.length] };

  await db.prepare(`INSERT INTO subjects (id, userId, name, color) VALUES (?, ?, ?, ?)`)
    .run(subject.id, userId, subject.name, subject.color);

  return subject;
}

export async function listSubjects(userId: string): Promise<SubjectDTO[]> {
  return (await db
    .prepare(`SELECT id, name, color FROM subjects WHERE userId = ? ORDER BY LOWER(name) ASC`)
    .all(userId)) as SubjectDTO[];
}

const SELECT_HOMEWORK = `
  SELECT h.*, s.name AS subjectName, s.color AS subjectColor
    FROM homework h
    LEFT JOIN subjects s ON s.id = h.subjectId
`;

export async function listHomework(userId: string): Promise<HomeworkDTO[]> {
  const rows = (await db
    .prepare(`${SELECT_HOMEWORK} WHERE h.userId = ? ORDER BY h.createdAt DESC`)
    .all(userId)) as HomeworkRow[];
  return rows.map(toDTO);
}

export async function getHomework(userId: string, id: string): Promise<HomeworkDTO | null> {
  const row = (await db
    .prepare(`${SELECT_HOMEWORK} WHERE h.userId = ? AND h.id = ?`)
    .get(userId, id)) as HomeworkRow | undefined;
  return row ? toDTO(row) : null;
}

export type CreateHomeworkInput = {
  userId: string;
  title: string;
  details: string;
  subject: string;
  dueAt: string | null;
  priority: string;
  estimateMins: number | null;
  rawInput: string;
  source: string;
  aiConfidence: number | null;
  aiNotes: string;
};

export type AttachmentDTO = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

/** Save an uploaded file (base64) as a pending attachment, not yet linked to any homework. */
export async function createPendingAttachment(
  userId: string, filename: string, mimeType: string, size: number, dataBase64: string
): Promise<AttachmentDTO> {
  const id = newId();
  const createdAt = nowISO();
  await db.prepare(
    `INSERT INTO attachments (id, userId, homeworkId, filename, mimeType, size, data, createdAt)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  ).run(id, userId, filename.slice(0, 200), mimeType.slice(0, 100), size, dataBase64, createdAt);
  return { id, filename, mimeType, size, createdAt };
}

/** Attach previously-uploaded pending attachments to a homework item once it's created. */
export async function linkAttachments(userId: string, homeworkId: string, attachmentIds: string[]) {
  if (!attachmentIds.length) return;
  const stmt = db.prepare(`UPDATE attachments SET homeworkId = ? WHERE userId = ? AND id = ? AND homeworkId IS NULL`);
  for (const attId of attachmentIds) await stmt.run(homeworkId, userId, attId);
}

export async function listAttachments(userId: string, homeworkId: string): Promise<AttachmentDTO[]> {
  return (await db
    .prepare(`SELECT id, filename, mimeType, size, createdAt FROM attachments WHERE userId = ? AND homeworkId = ? ORDER BY createdAt ASC`)
    .all(userId, homeworkId)) as AttachmentDTO[];
}

export async function getAttachmentFile(userId: string, attachmentId: string) {
  return (await db
    .prepare(`SELECT filename, mimeType, data FROM attachments WHERE userId = ? AND id = ?`)
    .get(userId, attachmentId)) as { filename: string; mimeType: string; data: string } | undefined;
}

export async function deleteAttachment(userId: string, attachmentId: string): Promise<boolean> {
  const res = await db.prepare(`DELETE FROM attachments WHERE userId = ? AND id = ?`).run(userId, attachmentId);
  return res.changes > 0;
}

export async function createHomework(input: CreateHomeworkInput): Promise<HomeworkDTO> {
  const subject = await ensureSubject(input.userId, input.subject);
  const id = newId();

  await db.prepare(
    `INSERT INTO homework
       (id, userId, subjectId, title, details, rawInput, source, dueAt,
        estimateMins, priority, status, aiConfidence, aiNotes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)`
  ).run(
    id, input.userId, subject.id, input.title, input.details, input.rawInput,
    input.source, input.dueAt, input.estimateMins, input.priority,
    input.aiConfidence, input.aiNotes, nowISO(), nowISO()
  );

  return (await getHomework(input.userId, id))!;
}

export type UpdateHomeworkPatch = Partial<{
  title: string;
  details: string;
  subject: string;
  dueAt: string | null;
  priority: string;
  estimateMins: number | null;
  status: string;
  /** Accumulated Focus Mode time, in seconds. */
  focusSeconds: number;
  startedAt: string | null;
  actualMins: number | null;
}>;

export async function updateHomework(userId: string, id: string, patch: UpdateHomeworkPatch): Promise<HomeworkDTO | null> {
  const existing = await getHomework(userId, id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); values.push(val); };

  if (patch.title !== undefined) push("title", patch.title);
  if (patch.details !== undefined) push("details", patch.details);
  if (patch.dueAt !== undefined) push("dueAt", patch.dueAt);
  if (patch.priority !== undefined) push("priority", patch.priority);
  if (patch.estimateMins !== undefined) push("estimateMins", patch.estimateMins);
  if (patch.subject !== undefined) push("subjectId", (await ensureSubject(userId, patch.subject)).id);
  if (patch.focusSeconds !== undefined) push("focusSeconds", Math.max(0, Math.round(patch.focusSeconds)));
  if (patch.startedAt !== undefined) push("startedAt", patch.startedAt);
  if (patch.actualMins !== undefined) push("actualMins", patch.actualMins);

  const completing = patch.status === "done" && existing.status !== "done";

  if (patch.status !== undefined) {
    push("status", patch.status);
    push("completedAt", patch.status === "done" ? nowISO() : null);
    // Re-opening a task clears the recorded duration; the next completion
    // measures the work afresh rather than inheriting a stale number.
    if (patch.status !== "done" && patch.actualMins === undefined) push("actualMins", null);
  }

  if (sets.length === 0) return existing;

  push("updatedAt", nowISO());
  values.push(userId, id);

  await db.prepare(`UPDATE homework SET ${sets.join(", ")} WHERE userId = ? AND id = ?`).run(...(values as any[]));

  const updated = await getHomework(userId, id);

  // Completion is the moment academic memory learns something. Recorded only on
  // the todo -> done transition, so toggling a finished task doesn't inflate history.
  if (completing && updated) {
    const focusMins = Math.round((updated.focusSeconds ?? 0) / 60);
    await recordTaskEvent({
      userId,
      homeworkId: updated.id,
      subjectName: updated.subject?.name ?? "General",
      estimateMins: updated.estimateMins,
      // Only trust a duration we actually measured. A task ticked off without
      // ever entering Focus Mode teaches nothing about how long work takes.
      actualMins: patch.actualMins ?? (focusMins > 0 ? focusMins : null),
      dueAt: updated.dueAt,
      completedAt: updated.completedAt ?? nowISO(),
    });
  }

  return updated;
}

export async function deleteHomework(userId: string, id: string): Promise<boolean> {
  const res = await db.prepare(`DELETE FROM homework WHERE userId = ? AND id = ?`).run(userId, id);
  return res.changes > 0;
}

export async function findUserByEmail(email: string) {
  return (await db
    .prepare(`SELECT id, name, email, image, passwordHash FROM users WHERE email = ?`)
    .get(email.toLowerCase())) as
    { id: string; name: string | null; email: string; image: string | null; passwordHash: string | null } | undefined;
}

export async function createUserWithPassword(name: string, email: string, passwordHash: string) {
  const id = newId();
  await db.prepare(`INSERT INTO users (id, name, email, passwordHash) VALUES (?, ?, ?, ?)`)
    .run(id, name, email.toLowerCase(), passwordHash);
  return { id, name, email: email.toLowerCase() };
}
