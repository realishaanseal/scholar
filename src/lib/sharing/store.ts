import { randomBytes } from "node:crypto";
import { db, newId, nowISO } from "../db";
import {
  canAdminister,
  canDistribute,
  canParticipate,
  isGrantActive,
  type GroupKind,
  type MemberRole,
  type ShareGrant,
  type ShareScope,
} from "./model";

/**
 * Access control and storage for everything shared.
 *
 * Every function that reads another person's data goes through `requireScope`
 * or `requireMembership` here. That's the point of the module: there is one
 * place where "may this person see this?" is decided, so an audit is reading
 * one file rather than grepping every route.
 */

export class AccessDenied extends Error {
  constructor(message = "You don't have access to that.") {
    super(message);
    this.name = "AccessDenied";
  }
}

/* ── Codes ────────────────────────────────────────────────────────────────
   Human-typeable: no vowels (so no accidental words), no 0/O/1/I/L. */
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";

function makeCode(length = 7): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

async function uniqueCode(column: "joinCode" | "inviteCode", table: "groups" | "share_grants"): Promise<string> {
  // Collisions are vanishingly unlikely but a duplicate would hand one person
  // access to the wrong group, so it's checked rather than assumed.
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = makeCode();
    const clash = await db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(code);
    if (!clash) return code;
  }
  throw new Error("Couldn't generate a unique code. Try again.");
}

/* ── Groups ───────────────────────────────────────────────────────────── */

export type GroupRow = {
  id: string;
  kind: GroupKind;
  name: string;
  subjectName: string | null;
  ownerUserId: string;
  joinCode: string | null;
  createdAt: string;
};

export type GroupWithRole = GroupRow & { role: MemberRole; memberCount: number };

export async function createGroup(
  userId: string,
  input: { name: string; kind?: GroupKind; subjectName?: string | null }
): Promise<GroupWithRole> {
  const id = newId();
  const kind = input.kind ?? "study-group";
  const joinCode = await uniqueCode("joinCode", "groups");

  const role: MemberRole = kind === "course" ? "teacher" : "owner";

  await db.prepare(
    `INSERT INTO groups (id, kind, name, subjectName, ownerUserId, joinCode, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, kind, input.name.trim().slice(0, 80), input.subjectName ?? null, userId, joinCode, nowISO());

  await db.prepare(
    `INSERT INTO group_members (groupId, userId, role, joinedAt) VALUES (?, ?, ?, ?)`
  ).run(id, userId, role, nowISO());

  return (await getGroupForUser(userId, id))!;
}

export async function roleIn(groupId: string, userId: string): Promise<MemberRole | null> {
  const row = (await db
    .prepare(`SELECT role FROM group_members WHERE groupId = ? AND userId = ?`)
    .get(groupId, userId)) as { role: MemberRole } | undefined;
  return row?.role ?? null;
}

/**
 * The membership gate. Throws rather than returning a falsy value on purpose —
 * a caller that forgets to check the result still fails closed.
 */
export async function requireMembership(groupId: string, userId: string): Promise<MemberRole> {
  const role = await roleIn(groupId, userId);
  // Deliberately the same message for "no such group" and "not a member":
  // distinguishing them would let anyone probe which group ids exist.
  if (!role) throw new AccessDenied("That group doesn't exist, or you're not a member.");
  return role;
}

export async function listGroups(userId: string): Promise<GroupWithRole[]> {
  return (await db
    .prepare(
      `SELECT g.*, m.role,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.groupId = g.id)::int AS memberCount
         FROM groups g
         JOIN group_members m ON m.groupId = g.id
        WHERE m.userId = ?
        ORDER BY g.createdAt DESC`
    )
    .all(userId)) as GroupWithRole[];
}

export async function getGroupForUser(userId: string, groupId: string): Promise<GroupWithRole | null> {
  const row = (await db
    .prepare(
      `SELECT g.*, m.role,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.groupId = g.id)::int AS memberCount
         FROM groups g
         JOIN group_members m ON m.groupId = g.id
        WHERE m.userId = ? AND g.id = ?`
    )
    .get(userId, groupId)) as GroupWithRole | undefined;
  return row ?? null;
}

export async function joinGroupByCode(userId: string, code: string): Promise<GroupWithRole> {
  const group = (await db
    .prepare(`SELECT * FROM groups WHERE joinCode = ?`)
    .get(code.trim().toUpperCase())) as GroupRow | undefined;

  if (!group) throw new AccessDenied("That code doesn't match any group.");

  const existing = await roleIn(group.id, userId);
  if (existing) return (await getGroupForUser(userId, group.id))!;

  await db.prepare(
    `INSERT INTO group_members (groupId, userId, role, joinedAt) VALUES (?, ?, 'member', ?)`
  ).run(group.id, userId, nowISO());

  return (await getGroupForUser(userId, group.id))!;
}

export async function listMembers(groupId: string, userId: string) {
  await requireMembership(groupId, userId);
  return (await db
    .prepare(
      `SELECT m.userId, m.role, m.joinedAt, u.name, u.email
         FROM group_members m JOIN users u ON u.id = m.userId
        WHERE m.groupId = ?
        ORDER BY m.joinedAt ASC`
    )
    .all(groupId)) as Array<{
      userId: string; role: MemberRole; joinedAt: string; name: string | null; email: string | null;
    }>;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const role = await requireMembership(groupId, userId);

  // The owner leaving would orphan the group; deleting it is the honest
  // outcome, and it's what the member list implies will happen.
  if (role === "owner") {
    await db.prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
    return;
  }
  await db.prepare(`DELETE FROM group_members WHERE groupId = ? AND userId = ?`).run(groupId, userId);
}

export async function removeMember(groupId: string, actorId: string, targetId: string): Promise<void> {
  const role = await requireMembership(groupId, actorId);
  if (!canAdminister(role)) throw new AccessDenied("Only the group owner can remove members.");
  if (targetId === actorId) throw new AccessDenied("Use “leave group” to remove yourself.");

  await db.prepare(`DELETE FROM group_members WHERE groupId = ? AND userId = ?`).run(groupId, targetId);
}

export async function rotateJoinCode(groupId: string, userId: string): Promise<string> {
  const role = await requireMembership(groupId, userId);
  if (!canAdminister(role)) throw new AccessDenied("Only the group owner can change the join code.");

  const code = await uniqueCode("joinCode", "groups");
  await db.prepare(`UPDATE groups SET joinCode = ? WHERE id = ?`).run(code, groupId);
  return code;
}

/* ── Group tasks & comments ───────────────────────────────────────────── */

export type GroupTask = {
  id: string;
  groupId: string;
  createdBy: string;
  title: string;
  details: string;
  subjectName: string | null;
  dueAt: string | null;
  estimateMins: number | null;
  assignedTo: string | null;
  createdAt: string;
  /** How many distinct members have flagged this post as wrong/misleading. */
  reportCount: number;
  /** Whether the CALLER specifically has flagged it — drives the button's
   *  own toggle state, separate from the count everyone sees. */
  reportedByMe: boolean;
};

export async function listGroupTasks(groupId: string, userId: string): Promise<GroupTask[]> {
  await requireMembership(groupId, userId);
  return (await db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM group_task_reports r WHERE r.taskId = t.id)::int AS reportCount,
              EXISTS(SELECT 1 FROM group_task_reports r WHERE r.taskId = t.id AND r.userId = ?) AS reportedByMe
         FROM group_tasks t
        WHERE t.groupId = ?
        ORDER BY (t.dueAt IS NULL), t.dueAt ASC`
    )
    .all(userId, groupId)) as GroupTask[];
}

export type ReportReason = "wrong" | "misleading" | "off-topic" | "other";

/**
 * Flag a task as wrong/misleading/etc. One report per member per task (the
 * UNIQUE constraint on group_task_reports) — reporting again just updates
 * the reason/note rather than inflating the count, since the point is "how
 * many distinct people are raising a concern," not how many times one did.
 */
export async function reportGroupTask(
  groupId: string, userId: string, taskId: string, reason: ReportReason, note: string
): Promise<{ reportCount: number }> {
  await requireMembership(groupId, userId);
  const task = (await db
    .prepare(`SELECT id FROM group_tasks WHERE id = ? AND groupId = ?`)
    .get(taskId, groupId)) as { id: string } | undefined;
  if (!task) throw new AccessDenied("That post doesn't exist.");

  await db.prepare(
    `INSERT INTO group_task_reports (id, taskId, groupId, userId, reason, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (taskId, userId) DO UPDATE SET reason = excluded.reason, note = excluded.note, createdAt = excluded.createdAt`
  ).run(newId(), taskId, groupId, userId, reason, note.trim().slice(0, 300), nowISO());

  const row = (await db
    .prepare(`SELECT COUNT(*)::int AS n FROM group_task_reports WHERE taskId = ?`)
    .get(taskId)) as { n: number };
  return { reportCount: row.n };
}

export async function unreportGroupTask(
  groupId: string, userId: string, taskId: string
): Promise<{ reportCount: number }> {
  await requireMembership(groupId, userId);
  await db.prepare(`DELETE FROM group_task_reports WHERE taskId = ? AND userId = ?`).run(taskId, userId);

  const row = (await db
    .prepare(`SELECT COUNT(*)::int AS n FROM group_task_reports WHERE taskId = ?`)
    .get(taskId)) as { n: number };
  return { reportCount: row.n };
}

/** Who flagged a post and why — visible only to whoever can moderate the
 *  group, so reporting isn't itself a way to broadcast an accusation. */
export async function listTaskReports(groupId: string, userId: string, taskId: string) {
  const role = await requireMembership(groupId, userId);
  if (!canAdminister(role)) throw new AccessDenied("Only the group owner can see report details.");

  return (await db
    .prepare(
      `SELECT r.reason, r.note, r.createdAt, u.name, u.email
         FROM group_task_reports r JOIN users u ON u.id = r.userId
        WHERE r.taskId = ? AND r.groupId = ?
        ORDER BY r.createdAt ASC`
    )
    .all(taskId, groupId)) as Array<{
      reason: ReportReason; note: string; createdAt: string; name: string | null; email: string | null;
    }>;
}

export async function createGroupTask(
  groupId: string,
  userId: string,
  input: {
    title: string; details?: string; subjectName?: string | null;
    dueAt?: string | null; estimateMins?: number | null; assignedTo?: string | null;
  }
): Promise<GroupTask> {
  const role = await requireMembership(groupId, userId);
  if (!canParticipate(role)) throw new AccessDenied("Observers can't post to a group.");

  // An assignee must actually be in the group, or the task points at someone
  // who can never see it.
  if (input.assignedTo && !(await roleIn(groupId, input.assignedTo))) {
    throw new AccessDenied("That person isn't in this group.");
  }

  const id = newId();
  await db.prepare(
    `INSERT INTO group_tasks (id, groupId, createdBy, title, details, subjectName, dueAt, estimateMins, assignedTo, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, groupId, userId, input.title.trim().slice(0, 160), (input.details ?? "").slice(0, 4000),
    input.subjectName ?? null, input.dueAt ?? null, input.estimateMins ?? null,
    input.assignedTo ?? null, nowISO()
  );

  return (await db.prepare(`SELECT * FROM group_tasks WHERE id = ?`).get(id)) as GroupTask;
}

export async function deleteGroupTask(groupId: string, userId: string, taskId: string): Promise<boolean> {
  const role = await requireMembership(groupId, userId);
  const task = (await db
    .prepare(`SELECT createdBy FROM group_tasks WHERE id = ? AND groupId = ?`)
    .get(taskId, groupId)) as { createdBy: string } | undefined;

  if (!task) return false;
  if (task.createdBy !== userId && !canAdminister(role)) {
    throw new AccessDenied("You can only remove work you posted.");
  }

  return (await db.prepare(`DELETE FROM group_tasks WHERE id = ? AND groupId = ?`).run(taskId, groupId)).changes > 0;
}

export type CommentAttachmentMeta = { id: string; filename: string; mimeType: string; size: number };

export async function listComments(groupId: string, userId: string, taskId: string | null) {
  await requireMembership(groupId, userId);
  const sql = taskId
    ? `SELECT c.*, u.name FROM group_comments c JOIN users u ON u.id = c.userId
        WHERE c.groupId = ? AND c.taskId = ? ORDER BY c.createdAt ASC`
    : `SELECT c.*, u.name FROM group_comments c JOIN users u ON u.id = c.userId
        WHERE c.groupId = ? AND c.taskId IS NULL ORDER BY c.createdAt ASC`;

  const args = taskId ? [groupId, taskId] : [groupId];
  const comments = (await db.prepare(sql).all(...args)) as Array<{
    id: string; groupId: string; taskId: string | null; userId: string;
    body: string; createdAt: string; name: string | null;
  }>;
  if (comments.length === 0) return [] as Array<(typeof comments)[number] & { attachments: CommentAttachmentMeta[] }>;

  // One query for every comment's attachment metadata (never the base64
  // `data` itself — that's only ever fetched for the one file being
  // downloaded, not for rendering the whole thread).
  const ids = comments.map((c) => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const attachmentRows = (await db
    .prepare(
      `SELECT id, commentId, filename, mimeType, size FROM group_comment_attachments WHERE commentId IN (${placeholders})`
    )
    .all(...ids)) as Array<CommentAttachmentMeta & { commentId: string }>;

  const byComment = new Map<string, CommentAttachmentMeta[]>();
  for (const a of attachmentRows) {
    const list = byComment.get(a.commentId) ?? [];
    list.push({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size });
    byComment.set(a.commentId, list);
  }

  return comments.map((c) => ({ ...c, attachments: byComment.get(c.id) ?? [] }));
}

export async function addComment(
  groupId: string,
  userId: string,
  body: string,
  taskId: string | null,
  attachment?: { filename: string; mimeType: string; size: number; dataBase64: string } | null
) {
  const role = await requireMembership(groupId, userId);
  if (!canParticipate(role)) throw new AccessDenied("Observers can't comment.");

  const id = newId();
  await db.prepare(
    `INSERT INTO group_comments (id, groupId, taskId, userId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, groupId, taskId, userId, body.trim().slice(0, 2000), nowISO());

  let attachmentMeta: CommentAttachmentMeta | null = null;
  if (attachment) {
    const attachmentId = newId();
    await db.prepare(
      `INSERT INTO group_comment_attachments (id, commentId, filename, mimeType, size, data, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attachmentId, id, attachment.filename.slice(0, 200), attachment.mimeType.slice(0, 100),
      attachment.size, attachment.dataBase64, nowISO()
    );
    attachmentMeta = { id: attachmentId, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size };
  }

  const comment = await db.prepare(`SELECT * FROM group_comments WHERE id = ?`).get(id);
  return { ...(comment as object), attachments: attachmentMeta ? [attachmentMeta] : [] };
}

/**
 * Fetch one attachment's bytes for download. Access is membership in the
 * GROUP the parent comment belongs to, not "did you post it" — any member
 * can see any comment in a group they're in, and attachments are no
 * different.
 */
export async function getCommentAttachment(groupId: string, userId: string, attachmentId: string) {
  await requireMembership(groupId, userId);
  return (await db
    .prepare(
      `SELECT a.filename, a.mimeType, a.data
         FROM group_comment_attachments a
         JOIN group_comments c ON c.id = a.commentId
        WHERE a.id = ? AND c.groupId = ?`
    )
    .get(attachmentId, groupId)) as { filename: string; mimeType: string; data: string } | undefined;
}

/* ── Share grants ─────────────────────────────────────────────────────── */

type GrantRow = Omit<ShareGrant, "scopes"> & { scopes: string };

function toGrant(row: GrantRow): ShareGrant {
  let scopes: ShareScope[] = [];
  try {
    const parsed = JSON.parse(row.scopes);
    if (Array.isArray(parsed)) scopes = parsed.filter((s) => typeof s === "string") as ShareScope[];
  } catch {
    // A corrupt scope blob must not fall open. An unreadable grant grants nothing.
    scopes = [];
  }
  return { ...row, scopes };
}

export async function createGrant(
  subjectUserId: string,
  input: { scopes: ShareScope[]; label: string; expiresAt?: string | null }
): Promise<ShareGrant> {
  const id = newId();
  const inviteCode = await uniqueCode("inviteCode", "share_grants");

  await db.prepare(
    `INSERT INTO share_grants (id, subjectUserId, viewerUserId, inviteCode, scopes, label, createdAt, expiresAt)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  ).run(
    id, subjectUserId, inviteCode, JSON.stringify(input.scopes),
    input.label.trim().slice(0, 60), nowISO(), input.expiresAt ?? null
  );

  return toGrant((await db.prepare(`SELECT * FROM share_grants WHERE id = ?`).get(id)) as GrantRow);
}

/** Grants this user has issued about their own data. */
export async function listGrantsIssued(subjectUserId: string): Promise<ShareGrant[]> {
  return (
    (await db
      .prepare(`SELECT * FROM share_grants WHERE subjectUserId = ? ORDER BY createdAt DESC`)
      .all(subjectUserId)) as GrantRow[]
  ).map(toGrant);
}

/** Grants this user can read — i.e. other people who shared with them. */
export async function listGrantsReceived(viewerUserId: string): Promise<ShareGrant[]> {
  return (
    (await db
      .prepare(`SELECT * FROM share_grants WHERE viewerUserId = ? ORDER BY createdAt DESC`)
      .all(viewerUserId)) as GrantRow[]
  ).map(toGrant);
}

export async function acceptGrant(viewerUserId: string, inviteCode: string): Promise<ShareGrant> {
  const row = (await db
    .prepare(`SELECT * FROM share_grants WHERE inviteCode = ?`)
    .get(inviteCode.trim().toUpperCase())) as GrantRow | undefined;

  if (!row) throw new AccessDenied("That invite code isn't valid.");

  const grant = toGrant(row);
  if (!isGrantActive(grant)) throw new AccessDenied("That invite has expired or been revoked.");
  if (grant.viewerUserId && grant.viewerUserId !== viewerUserId) {
    throw new AccessDenied("That invite has already been used.");
  }
  if (grant.subjectUserId === viewerUserId) {
    throw new AccessDenied("That's your own invite code.");
  }

  // Binding clears the code: an invite is single-use, so a screenshot of it
  // in a family chat doesn't stay live forever.
  await db.prepare(`UPDATE share_grants SET viewerUserId = ?, inviteCode = NULL WHERE id = ?`)
    .run(viewerUserId, grant.id);

  return toGrant((await db.prepare(`SELECT * FROM share_grants WHERE id = ?`).get(grant.id)) as GrantRow);
}

/** Revoke. Only the person whose data it is may do this. */
export async function revokeGrant(subjectUserId: string, grantId: string): Promise<boolean> {
  return (
    (await db
      .prepare(`UPDATE share_grants SET revokedAt = ? WHERE id = ? AND subjectUserId = ? AND revokedAt IS NULL`)
      .run(nowISO(), grantId, subjectUserId)).changes > 0
  );
}

/**
 * The scope gate.
 *
 * Returns the subject's user id if `viewerUserId` may read `scope` about them,
 * and throws otherwise. Every cross-user read in the app calls this — there is
 * no other path to another person's data.
 */
export async function requireScope(viewerUserId: string, grantId: string, scope: ShareScope): Promise<string> {
  const row = (await db.prepare(`SELECT * FROM share_grants WHERE id = ?`).get(grantId)) as GrantRow | undefined;
  if (!row) throw new AccessDenied();

  const grant = toGrant(row);

  if (grant.viewerUserId !== viewerUserId) throw new AccessDenied();
  if (!isGrantActive(grant)) throw new AccessDenied("That share has been revoked or expired.");
  if (!grant.scopes.includes(scope)) {
    throw new AccessDenied("That isn't part of what was shared with you.");
  }

  return grant.subjectUserId;
}

export { canAdminister, canDistribute, canParticipate, isGrantActive };
