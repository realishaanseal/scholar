import { db } from "../db";

/**
 * Varaxis ID — the account layer future Varaxis products will share.
 *
 * Deliberately thin, and deliberately NOT surfaced as a separate login. Scholar
 * is the first product; inventing a cross-product account system before a
 * second product exists would be building an abstraction against an imagined
 * requirement. What this does provide is the boundary: everything genuinely
 * about *the person* rather than *their homework* is gathered here, so a second
 * product can adopt it without unpicking Scholar's tables.
 *
 * The two things that must work from day one — because they are promises the
 * product makes about privacy, not features — are export and deletion.
 */

export type VaraxisProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  /** Products under this identity. Only Scholar exists today. */
  products: Array<{ id: string; label: string; active: boolean }>;
};

export async function getProfile(userId: string): Promise<VaraxisProfile | null> {
  const row = (await db
    .prepare(`SELECT id, name, email, image, createdAt FROM users WHERE id = ?`)
    .get(userId)) as Omit<VaraxisProfile, "products"> | undefined;

  if (!row) return null;

  return {
    ...row,
    products: [{ id: "scholar", label: "Varaxis Scholar", active: true }],
  };
}

export async function updateProfile(userId: string, patch: { name?: string }): Promise<VaraxisProfile | null> {
  if (patch.name !== undefined) {
    await db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(patch.name.trim().slice(0, 80), userId);
  }
  return getProfile(userId);
}

/**
 * Everything Scholar holds about one person, as plain JSON.
 *
 * Encrypted API keys are deliberately excluded: exporting a decrypted key into
 * a file in the Downloads folder would be a worse outcome than not exporting
 * it, and the student already has the key from the provider.
 */
export async function exportEverything(userId: string) {
  const one = (sql: string) => db.prepare(sql).get(userId);
  const many = (sql: string) => db.prepare(sql).all(userId);

  return {
    exportedAt: new Date().toISOString(),
    format: "varaxis-scholar-export-v1",
    profile: await getProfile(userId),

    homework: await many(
      `SELECT h.*, s.name AS subjectName FROM homework h
         LEFT JOIN subjects s ON s.id = h.subjectId
        WHERE h.userId = ? ORDER BY h.createdAt ASC`
    ),
    subjects: await many(`SELECT id, name, color, createdAt FROM subjects WHERE userId = ? ORDER BY name`),
    taskHistory: await many(`SELECT * FROM task_events WHERE userId = ? ORDER BY completedAt ASC`),
    timetable: await many(`SELECT * FROM timetable WHERE userId = ? ORDER BY dayOfWeek, startHour`),
    studyProfile: await one(`SELECT * FROM academic_profile WHERE userId = ?`),

    // Filenames and sizes only. The bytes stay put: a JSON file with every
    // attachment inlined as base64 would be unusable and enormous.
    attachments: await many(
      `SELECT id, homeworkId, filename, mimeType, size, createdAt FROM attachments WHERE userId = ? ORDER BY createdAt`
    ),

    sharing: {
      groupsOwned: await many(`SELECT id, kind, name, subjectName, createdAt FROM groups WHERE ownerUserId = ?`),
      memberships: await many(
        `SELECT g.id, g.name, g.kind, m.role, m.joinedAt FROM group_members m
           JOIN groups g ON g.id = m.groupId WHERE m.userId = ?`
      ),
      grantsIssued: await many(
        `SELECT id, viewerUserId, scopes, label, createdAt, expiresAt, revokedAt FROM share_grants WHERE subjectUserId = ?`
      ),
      grantsReceived: await many(
        `SELECT id, subjectUserId, scopes, label, createdAt, expiresAt, revokedAt FROM share_grants WHERE viewerUserId = ?`
      ),
    },

    aiSettings: await one(
      // The provider and model are the student's own configuration and safe to
      // export; apiKeyCipher is intentionally omitted.
      `SELECT aiProvider, aiModel, apiKeyHint, updatedAt FROM user_settings WHERE userId = ?`
    ),

    note:
      "Encrypted API keys and attachment file contents are excluded by design. " +
      "Attachments are listed by name and size; download them individually from Scholar if you need the files.",
  };
}

/**
 * Delete the account and everything belonging to it.
 *
 * Most rows disappear through ON DELETE CASCADE from `users`. The exceptions
 * are handled explicitly first, because cascade rules alone would leave the
 * person's name attached to content other people can still see.
 */
export async function deleteAccount(userId: string): Promise<{ deleted: true }> {
  const tx = db.transaction(async () => {
    // Groups this person owns are removed outright: an ownerless group whose
    // join code still works would outlive the account that created it.
    await db.prepare(`DELETE FROM groups WHERE ownerUserId = ?`).run(userId);

    // Their posts and comments in OTHER people's groups go too. Leaving them
    // would mean deleting an account doesn't delete what that account wrote.
    await db.prepare(`DELETE FROM group_comments WHERE userId = ?`).run(userId);
    await db.prepare(`DELETE FROM group_tasks WHERE createdBy = ?`).run(userId);
    await db.prepare(`DELETE FROM group_members WHERE userId = ?`).run(userId);

    // Grants in both directions, so nobody keeps a live view of a gone account.
    await db.prepare(`DELETE FROM share_grants WHERE subjectUserId = ? OR viewerUserId = ?`).run(userId, userId);

    // The rest cascades from here.
    await db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  });

  await tx();
  return { deleted: true };
}
