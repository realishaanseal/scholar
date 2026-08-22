import { FieldValue } from "firebase-admin/firestore";
import { db, bucket, newId, nowISO } from "./db";
import { recordTaskEvent } from "./scholar/memory";
import type { HomeworkDTO, SubjectDTO } from "./clientTypes";

/**
 * Firestore data layer.
 *
 * Every user's app data lives under `users/{uid}/...` subcollections, so a
 * single security rule (`request.auth.uid == uid`) covers all of it, and every
 * query below is implicitly scoped to one student without a WHERE clause.
 *
 * The Admin SDK is fully async where better-sqlite3 was synchronous — every
 * function here (and every caller) had to grow an `await`. That's the one
 * structural change this port makes beyond swapping the storage engine.
 */

const PALETTE = [
  "#5b7cfa", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4",
  "#a855f7", "#ef4444", "#14b8a6", "#f97316", "#8b5cf6",
];

function userDoc(userId: string) {
  return db.collection("users").doc(userId);
}
function subjectsCol(userId: string) {
  return userDoc(userId).collection("subjects");
}
function homeworkCol(userId: string) {
  return userDoc(userId).collection("homework");
}
function attachmentsCol(userId: string) {
  return userDoc(userId).collection("attachments");
}

type HomeworkDoc = {
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  title: string;
  details: string;
  rawInput: string;
  source: string;
  dueAt: string | null;
  estimateMins: number | null;
  priority: string;
  status: string;
  aiConfidence: number | null;
  aiNotes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  actualMins: number | null;
  startedAt: string | null;
  focusSeconds: number;
};

function toDTO(id: string, r: HomeworkDoc): HomeworkDTO {
  return {
    id,
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
  const nameLower = name.toLowerCase();

  const existing = await subjectsCol(userId).where("nameLower", "==", nameLower).limit(1).get();
  if (!existing.empty) {
    const d = existing.docs[0]!;
    const data = d.data() as { name: string; color: string };
    return { id: d.id, name: data.name, color: data.color };
  }

  const countSnap = await subjectsCol(userId).count().get();
  const count = countSnap.data().count;

  const id = newId();
  const subject: SubjectDTO = { id, name, color: PALETTE[count % PALETTE.length]! };

  await subjectsCol(userId).doc(id).set({
    name: subject.name,
    nameLower,
    color: subject.color,
    createdAt: nowISO(),
  });

  return subject;
}

export async function listSubjects(userId: string): Promise<SubjectDTO[]> {
  const snap = await subjectsCol(userId).orderBy("nameLower", "asc").get();
  return snap.docs.map((d) => {
    const data = d.data() as { name: string; color: string };
    return { id: d.id, name: data.name, color: data.color };
  });
}

export async function listHomework(userId: string): Promise<HomeworkDTO[]> {
  const snap = await homeworkCol(userId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => toDTO(d.id, d.data() as HomeworkDoc));
}

export async function getHomework(userId: string, id: string): Promise<HomeworkDTO | null> {
  const doc = await homeworkCol(userId).doc(id).get();
  if (!doc.exists) return null;
  return toDTO(doc.id, doc.data() as HomeworkDoc);
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

function storagePathFor(userId: string, attachmentId: string): string {
  return `attachments/${userId}/${attachmentId}`;
}

/** Save an uploaded file to Storage and record it as a pending attachment, not yet linked to any homework. */
export async function createPendingAttachment(
  userId: string,
  filename: string,
  mimeType: string,
  size: number,
  data: Buffer
): Promise<AttachmentDTO> {
  const id = newId();
  const createdAt = nowISO();
  const safeName = filename.slice(0, 200);
  const safeMime = mimeType.slice(0, 100) || "application/octet-stream";
  const path = storagePathFor(userId, id);

  await bucket.file(path).save(data, { contentType: safeMime, resumable: false });

  await attachmentsCol(userId).doc(id).set({
    homeworkId: null,
    filename: safeName,
    mimeType: safeMime,
    size,
    storagePath: path,
    createdAt,
  });

  return { id, filename: safeName, mimeType: safeMime, size, createdAt };
}

/** Attach previously-uploaded pending attachments to a homework item once it's created. */
export async function linkAttachments(userId: string, homeworkId: string, attachmentIds: string[]): Promise<void> {
  if (!attachmentIds.length) return;

  await Promise.all(
    attachmentIds.map(async (attId) => {
      const ref = attachmentsCol(userId).doc(attId);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data() as { homeworkId: string | null };
      if (data.homeworkId !== null) return; // already linked — don't steal it
      await ref.update({ homeworkId });
    })
  );
}

export async function listAttachments(userId: string, homeworkId: string): Promise<AttachmentDTO[]> {
  const snap = await attachmentsCol(userId)
    .where("homeworkId", "==", homeworkId)
    .orderBy("createdAt", "asc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data() as { filename: string; mimeType: string; size: number; createdAt: string };
    return { id: d.id, filename: data.filename, mimeType: data.mimeType, size: data.size, createdAt: data.createdAt };
  });
}

export async function getAttachmentFile(
  userId: string,
  attachmentId: string
): Promise<{ filename: string; mimeType: string; data: string } | undefined> {
  const snap = await attachmentsCol(userId).doc(attachmentId).get();
  if (!snap.exists) return undefined;
  const data = snap.data() as { filename: string; mimeType: string; storagePath: string };

  const [bytes] = await bucket.file(data.storagePath).download();
  return { filename: data.filename, mimeType: data.mimeType, data: bytes.toString("base64") };
}

export async function deleteAttachment(userId: string, attachmentId: string): Promise<boolean> {
  const ref = attachmentsCol(userId).doc(attachmentId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data() as { storagePath: string };
  await bucket.file(data.storagePath).delete({ ignoreNotFound: true }).catch(() => {});
  await ref.delete();
  return true;
}

export async function createHomework(input: CreateHomeworkInput): Promise<HomeworkDTO> {
  const subject = await ensureSubject(input.userId, input.subject);
  const id = newId();
  const now = nowISO();

  const doc: HomeworkDoc = {
    subjectId: subject.id,
    subjectName: subject.name,
    subjectColor: subject.color,
    title: input.title,
    details: input.details,
    rawInput: input.rawInput,
    source: input.source,
    dueAt: input.dueAt,
    estimateMins: input.estimateMins,
    priority: input.priority,
    status: "todo",
    aiConfidence: input.aiConfidence,
    aiNotes: input.aiNotes,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    actualMins: null,
    startedAt: null,
    focusSeconds: 0,
  };

  await homeworkCol(input.userId).doc(id).set(doc);
  return toDTO(id, doc);
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

export async function updateHomework(
  userId: string,
  id: string,
  patch: UpdateHomeworkPatch
): Promise<HomeworkDTO | null> {
  const ref = homeworkCol(userId).doc(id);
  const existingSnap = await ref.get();
  if (!existingSnap.exists) return null;
  const existing = toDTO(id, existingSnap.data() as HomeworkDoc);

  const set: Record<string, unknown> = {};

  if (patch.title !== undefined) set.title = patch.title;
  if (patch.details !== undefined) set.details = patch.details;
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.estimateMins !== undefined) set.estimateMins = patch.estimateMins;
  if (patch.subject !== undefined) {
    const subject = await ensureSubject(userId, patch.subject);
    set.subjectId = subject.id;
    set.subjectName = subject.name;
    set.subjectColor = subject.color;
  }
  if (patch.focusSeconds !== undefined) set.focusSeconds = Math.max(0, Math.round(patch.focusSeconds));
  if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
  if (patch.actualMins !== undefined) set.actualMins = patch.actualMins;

  const completing = patch.status === "done" && existing.status !== "done";

  if (patch.status !== undefined) {
    set.status = patch.status;
    set.completedAt = patch.status === "done" ? nowISO() : null;
    // Re-opening a task clears the recorded duration; the next completion
    // measures the work afresh rather than inheriting a stale number.
    if (patch.status !== "done" && patch.actualMins === undefined) set.actualMins = null;
  }

  if (Object.keys(set).length === 0) return existing;

  set.updatedAt = nowISO();
  await ref.update(set);

  const updatedSnap = await ref.get();
  const updated = toDTO(id, updatedSnap.data() as HomeworkDoc);

  // Completion is the moment academic memory learns something. Recorded only on
  // the todo -> done transition, so toggling a finished task doesn't inflate history.
  if (completing) {
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
  const ref = homeworkCol(userId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  // Clean up any attachments that belonged to this task, and their Storage
  // bytes — Firestore has no cascading delete, and leaving orphaned files
  // around would quietly burn the free tier's storage quota.
  const attachments = await attachmentsCol(userId).where("homeworkId", "==", id).get();
  await Promise.all(
    attachments.docs.map(async (d) => {
      const data = d.data() as { storagePath: string };
      await bucket.file(data.storagePath).delete({ ignoreNotFound: true }).catch(() => {});
      await d.ref.delete();
    })
  );

  await ref.delete();
  return true;
}

export type UserRecord = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  passwordHash: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const snap = await db
    .collection("users")
    .where("email", "==", email.toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) return undefined;

  const d = snap.docs[0]!;
  const data = d.data() as { name: string | null; email: string; image: string | null; passwordHash: string | null };
  return { id: d.id, name: data.name ?? null, email: data.email, image: data.image ?? null, passwordHash: data.passwordHash ?? null };
}

export async function createUserWithPassword(name: string, email: string, passwordHash: string) {
  const id = newId();
  const lower = email.toLowerCase();
  await db.collection("users").doc(id).set({
    name,
    email: lower,
    emailVerified: null,
    image: null,
    passwordHash,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id, name, email: lower };
}
