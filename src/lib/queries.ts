import { db, newId, nowISO } from "./db";
import { recordTaskEvent } from "./scholar/memory";
import type { HomeworkDTO, SubjectDTO, TimetableSlotDTO } from "./clientTypes";
import { EXTERNAL_SOURCE } from "@/domains/assessment/projection";

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
  externalId: string | null; externalSource: string | null;
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
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
    actualMins: r.actualMins,
    startedAt: r.startedAt,
    focusSeconds: r.focusSeconds ?? 0,
    subject: r.subjectId
      ? { id: r.subjectId, name: r.subjectName ?? "General", color: r.subjectColor ?? "#5b7cfa" }
      : null,
    // Resolved separately by listHomework: the row knows the assignment id,
    // but turning it into a link needs the section, and joining that into
    // every homework read would cost a join for the majority of tasks that
    // are not projected at all.
    courseLink: null,
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

/** The student's whole timetable, ordered so the AI (and anything else that
 *  needs "what's on when") can walk it in schedule order without re-sorting.
 *  Used to resolve phrases like "next chem class" or "tomorrow's 3rd period"
 *  against a real schedule instead of guessing. */
export async function listTimetable(userId: string): Promise<TimetableSlotDTO[]> {
  return (await db
    .prepare(
      `SELECT id, title, subjectName, dayOfWeek, startHour, startMin, endHour, endMin, location, teacherName, kind
         FROM timetable WHERE userId = ? ORDER BY dayOfWeek, startHour, startMin`
    )
    .all(userId)) as TimetableSlotDTO[];
}

const SELECT_HOMEWORK = `
  SELECT h.*, s.name AS subjectName, s.color AS subjectColor
    FROM homework h
    LEFT JOIN subjects s ON s.id = h.subjectId
`;

/** Every externalId already imported from a given source, for dedup previews
 *  (e.g. an LMS import screen that shouldn't re-offer what's already in). */
export async function listExternalIds(userId: string, externalSource: string): Promise<Set<string>> {
  const rows = (await db
    .prepare(`SELECT externalId FROM homework WHERE userId = ? AND externalSource = ? AND externalId IS NOT NULL`)
    .all(userId, externalSource)) as Array<{ externalId: string }>;
  return new Set(rows.map((r) => r.externalId));
}

export async function listHomework(userId: string): Promise<HomeworkDTO[]> {
  // Archived rows are tasks projected from coursework that has since been
  // cancelled. They are kept rather than deleted — the student may have logged
  // real time against them — but they should not sit in the list as though
  // they were still owed. Only the projection ever sets this, so a task the
  // student typed themselves is never affected.
  const rows = (await db
    .prepare(
      `${SELECT_HOMEWORK} WHERE h.userId = ? AND h.archived_at IS NULL ORDER BY h.createdAt DESC`
    )
    .all(userId)) as HomeworkRow[];

  const tasks = rows.map(toDTO);

  // Tasks projected from coursework get a link back to the brief. Resolved in
  // one extra query over just those rows rather than joining three
  // institutional tables into every homework read — most people have no
  // projected tasks at all, and they should not pay for the ones who do.
  const assignmentIds = rows
    .filter((r) => r.externalSource === EXTERNAL_SOURCE && r.externalId)
    .map((r) => r.externalId as string);

  if (assignmentIds.length > 0) {
    const links = (await db
      .prepare(
        `SELECT a.id AS assignment_id, cs.id AS section_id, c.code AS course_code
           FROM assignments a
           JOIN course_sections cs ON cs.id = a.course_section_id
           JOIN courses c ON c.id = cs.course_id
          WHERE a.id = ANY(?)`
      )
      .all(assignmentIds)) as {
      assignment_id: string; section_id: string; course_code: string;
    }[];

    const byId = new Map(links.map((l) => [l.assignment_id, l]));
    for (let i = 0; i < rows.length; i++) {
      const link = rows[i].externalId ? byId.get(rows[i].externalId as string) : undefined;
      if (link) {
        tasks[i].courseLink = {
          assignmentId: link.assignment_id,
          sectionId: link.section_id,
          courseCode: link.course_code,
        };
      }
    }
  }

  return tasks;
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
  /** Set when this task originates from an external sync (LMS ICS import,
   *  Google Calendar), so a later resync can find and update it by identity
   *  instead of guessing from the title. */
  externalId?: string | null;
  externalSource?: string | null;
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
        estimateMins, priority, status, aiConfidence, aiNotes, createdAt, updatedAt,
        externalId, externalSource)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.userId, subject.id, input.title, input.details, input.rawInput,
    input.source, input.dueAt, input.estimateMins, input.priority,
    input.aiConfidence, input.aiNotes, nowISO(), nowISO(),
    input.externalId ?? null, input.externalSource ?? null
  );

  return (await getHomework(input.userId, id))!;
}

export type ExternalHomeworkUpsert = {
  userId: string;
  externalSource: string;
  externalId: string;
  title: string;
  details: string;
  subject: string;
  dueAt: string | null;
  priority?: string;
  estimateMins?: number | null;
};

/**
 * Create-or-update a homework row keyed by (userId, externalSource, externalId)
 * — the identity a resync uses to recognize "this is the same Canvas
 * assignment / Google Calendar event I already imported" instead of matching
 * on title, which breaks the moment either side edits the title.
 *
 * Deliberately does NOT touch `status`, `priority` (on update), or anything
 * the student may have changed locally — a resync should refresh the facts
 * that came from the source (title, details, due date) without clobbering
 * work the student already did on the task (marking it in-progress, done,
 * bumping the priority).
 */
export async function upsertExternalHomework(
  input: ExternalHomeworkUpsert
): Promise<{ homework: HomeworkDTO; created: boolean }> {
  const existing = (await db
    .prepare(
      `SELECT id FROM homework WHERE userId = ? AND externalSource = ? AND externalId = ?`
    )
    .get(input.userId, input.externalSource, input.externalId)) as { id: string } | undefined;

  if (existing) {
    const subject = await ensureSubject(input.userId, input.subject);
    await db.prepare(
      `UPDATE homework
          SET title = ?, details = ?, dueAt = ?, subjectId = ?, updatedAt = ?
        WHERE userId = ? AND id = ?`
    ).run(input.title, input.details, input.dueAt, subject.id, nowISO(), input.userId, existing.id);

    return { homework: (await getHomework(input.userId, existing.id))!, created: false };
  }

  const homework = await createHomework({
    userId: input.userId,
    title: input.title,
    details: input.details,
    subject: input.subject,
    dueAt: input.dueAt,
    priority: input.priority ?? "normal",
    estimateMins: input.estimateMins ?? null,
    rawInput: "",
    source: "text",
    aiConfidence: null,
    aiNotes: "",
    externalId: input.externalId,
    externalSource: input.externalSource,
  });

  return { homework, created: true };
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
