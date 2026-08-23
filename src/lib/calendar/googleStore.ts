import { db, newId, nowISO } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { refreshAccessToken, revokeToken } from "./google";

/**
 * Storage for the Google Calendar connection and the per-task event links.
 * Server-only (imports `db`) — kept separate from `google.ts` so that file
 * can stay a pure API client with no database dependency.
 */

export type CalendarConnection = {
  calendarId: string;
  scope: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
};

type ConnectionRow = {
  accessTokenCipher: string | null;
  refreshTokenCipher: string;
  tokenExpiresAt: string | null;
  scope: string | null;
  calendarId: string;
  syncToken: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
};

export async function getConnection(userId: string): Promise<CalendarConnection | null> {
  const row = (await db
    .prepare(
      `SELECT calendarId, scope, lastSyncedAt, lastSyncError, createdAt
         FROM calendar_connections WHERE userId = ? AND provider = 'google'`
    )
    .get(userId)) as CalendarConnection | undefined;
  return row ?? null;
}

export async function saveConnection(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: string; scope: string }
): Promise<void> {
  await db.prepare(
    `INSERT INTO calendar_connections
       (userId, provider, accessTokenCipher, refreshTokenCipher, tokenExpiresAt, scope)
     VALUES (?, 'google', ?, ?, ?, ?)
     ON CONFLICT (userId) DO UPDATE SET
       accessTokenCipher = excluded.accessTokenCipher,
       refreshTokenCipher = excluded.refreshTokenCipher,
       tokenExpiresAt = excluded.tokenExpiresAt,
       scope = excluded.scope,
       -- A reconnect should get a clean incremental-sync cursor, not resume
       -- from whatever the previous connection last saw.
       syncToken = NULL,
       lastSyncError = NULL`
  ).run(
    userId,
    encryptSecret(tokens.accessToken),
    encryptSecret(tokens.refreshToken),
    tokens.expiresAt,
    tokens.scope
  );
}

export async function disconnect(userId: string): Promise<void> {
  const row = (await db
    .prepare(`SELECT refreshTokenCipher FROM calendar_connections WHERE userId = ? AND provider = 'google'`)
    .get(userId)) as { refreshTokenCipher: string } | undefined;

  if (row) {
    const refreshToken = decryptSecret(row.refreshTokenCipher);
    if (refreshToken) await revokeToken(refreshToken);
  }

  // calendar_links cascades from homework, not from calendar_connections —
  // clear them explicitly so a reconnect doesn't inherit a stale mapping to
  // events that may since have been deleted on Google's side.
  await db.prepare(`DELETE FROM calendar_links WHERE userId = ? AND provider = 'google'`).run(userId);
  await db.prepare(`DELETE FROM calendar_connections WHERE userId = ? AND provider = 'google'`).run(userId);
}

/**
 * A valid access token for this user, refreshing it first if it's expired or
 * about to be. Returns null if there's no connection at all.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const row = (await db
    .prepare(
      `SELECT accessTokenCipher, refreshTokenCipher, tokenExpiresAt
         FROM calendar_connections WHERE userId = ? AND provider = 'google'`
    )
    .get(userId)) as Pick<ConnectionRow, "accessTokenCipher" | "refreshTokenCipher" | "tokenExpiresAt"> | undefined;

  if (!row) return null;

  const expiresAt = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;
  const expiringSoon = expiresAt < Date.now() + 60_000;

  if (!expiringSoon && row.accessTokenCipher) {
    const cached = decryptSecret(row.accessTokenCipher);
    if (cached) return cached;
  }

  const refreshToken = decryptSecret(row.refreshTokenCipher);
  if (!refreshToken) {
    await setSyncError(userId, "Google Calendar's stored connection could not be read — reconnect it.");
    return null;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  await db.prepare(
    `UPDATE calendar_connections SET accessTokenCipher = ?, tokenExpiresAt = ? WHERE userId = ? AND provider = 'google'`
  ).run(encryptSecret(refreshed.accessToken), refreshed.expiresAt, userId);

  return refreshed.accessToken;
}

export async function getSyncToken(userId: string): Promise<string | null> {
  const row = (await db
    .prepare(`SELECT syncToken FROM calendar_connections WHERE userId = ? AND provider = 'google'`)
    .get(userId)) as { syncToken: string | null } | undefined;
  return row?.syncToken ?? null;
}

export async function setSyncToken(userId: string, syncToken: string | null): Promise<void> {
  await db.prepare(`UPDATE calendar_connections SET syncToken = ? WHERE userId = ? AND provider = 'google'`)
    .run(syncToken, userId);
}

export async function markSynced(userId: string): Promise<void> {
  await db.prepare(
    `UPDATE calendar_connections SET lastSyncedAt = ?, lastSyncError = NULL WHERE userId = ? AND provider = 'google'`
  ).run(nowISO(), userId);
}

export async function setSyncError(userId: string, message: string): Promise<void> {
  await db.prepare(`UPDATE calendar_connections SET lastSyncError = ? WHERE userId = ? AND provider = 'google'`)
    .run(message.slice(0, 500), userId);
}

/* ── Per-task ↔ event links ──────────────────────────────────────────────── */

export type CalendarLink = { homeworkId: string; externalEventId: string; lastPushedAt: string | null; lastPulledAt: string | null };

export async function getLinkByHomeworkId(userId: string, homeworkId: string): Promise<CalendarLink | null> {
  const row = (await db
    .prepare(
      `SELECT homeworkId, externalEventId, lastPushedAt, lastPulledAt
         FROM calendar_links WHERE userId = ? AND homeworkId = ? AND provider = 'google'`
    )
    .get(userId, homeworkId)) as CalendarLink | undefined;
  return row ?? null;
}

export async function getLinkByEventId(userId: string, externalEventId: string): Promise<CalendarLink | null> {
  const row = (await db
    .prepare(
      `SELECT homeworkId, externalEventId, lastPushedAt, lastPulledAt
         FROM calendar_links WHERE userId = ? AND externalEventId = ? AND provider = 'google'`
    )
    .get(userId, externalEventId)) as CalendarLink | undefined;
  return row ?? null;
}

export async function upsertLinkPushed(userId: string, homeworkId: string, externalEventId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO calendar_links (id, userId, homeworkId, provider, externalEventId, lastPushedAt, createdAt)
     VALUES (?, ?, ?, 'google', ?, ?, ?)
     ON CONFLICT (userId, homeworkId, provider) DO UPDATE SET
       externalEventId = excluded.externalEventId, lastPushedAt = excluded.lastPushedAt`
  ).run(newId(), userId, homeworkId, externalEventId, nowISO(), nowISO());
}

export async function upsertLinkPulled(userId: string, homeworkId: string, externalEventId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO calendar_links (id, userId, homeworkId, provider, externalEventId, lastPulledAt, createdAt)
     VALUES (?, ?, ?, 'google', ?, ?, ?)
     ON CONFLICT (userId, homeworkId, provider) DO UPDATE SET
       externalEventId = excluded.externalEventId, lastPulledAt = excluded.lastPulledAt`
  ).run(newId(), userId, homeworkId, externalEventId, nowISO(), nowISO());
}

export async function deleteLinkByHomeworkId(userId: string, homeworkId: string): Promise<void> {
  await db.prepare(`DELETE FROM calendar_links WHERE userId = ? AND homeworkId = ? AND provider = 'google'`)
    .run(userId, homeworkId);
}

export async function deleteLinkByEventId(userId: string, externalEventId: string): Promise<void> {
  await db.prepare(`DELETE FROM calendar_links WHERE userId = ? AND externalEventId = ? AND provider = 'google'`)
    .run(userId, externalEventId);
}

/** Every currently-linked homeworkId for this user, for the push pass to know
 *  what's already been sent without a per-item lookup. */
export async function listLinkedHomeworkIds(userId: string): Promise<Set<string>> {
  const rows = (await db
    .prepare(`SELECT homeworkId FROM calendar_links WHERE userId = ? AND provider = 'google'`)
    .all(userId)) as Array<{ homeworkId: string }>;
  return new Set(rows.map((r) => r.homeworkId));
}
