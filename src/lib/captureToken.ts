import { randomBytes, timingSafeEqual } from "node:crypto";
import { db, nowISO } from "./db";

/**
 * Bearer token used by the browser extension.
 *
 * A session cookie can't work here: the extension's origin is
 * chrome-extension://, so NextAuth's SameSite=Lax cookie is never sent, and
 * wildcard CORS is rejected outright for credentialed requests. A token the
 * student pastes into the extension once is the honest solution — it also means
 * the extension holds a credential scoped to exactly one capability rather than
 * a full session.
 */

export async function getCaptureToken(userId: string): Promise<string | null> {
  const row = (await db
    .prepare(`SELECT captureToken FROM user_settings WHERE userId = ?`)
    .get(userId)) as { captureToken: string | null } | undefined;
  return row?.captureToken ?? null;
}

/**
 * The token plus the one thing that actually proves it works: when a capture
 * request last authenticated with it. Settings surfaces this as "Connected"
 * vs "Not connected yet" — a token can be copied perfectly and still never
 * get pasted into the extension, and this is what tells the two apart.
 */
export async function getCaptureStatus(
  userId: string
): Promise<{ token: string | null; lastUsedAt: string | null }> {
  const row = (await db
    .prepare(`SELECT captureToken, captureTokenLastUsedAt FROM user_settings WHERE userId = ?`)
    .get(userId)) as { captureToken: string | null; captureTokenLastUsedAt: string | null } | undefined;
  return { token: row?.captureToken ?? null, lastUsedAt: row?.captureTokenLastUsedAt ?? null };
}

export async function ensureCaptureToken(userId: string): Promise<string> {
  const existing = await getCaptureToken(userId);
  if (existing) return existing;
  return rotateCaptureToken(userId);
}

export async function rotateCaptureToken(userId: string): Promise<string> {
  const token = `vxs_${randomBytes(24).toString("base64url")}`;

  // A freshly (re)generated token has never authenticated anything yet —
  // clearing captureTokenLastUsedAt here is what makes "Connected" turn back
  // into "Not connected yet" the moment a rotate invalidates the old one.
  await db.prepare(
    `INSERT INTO user_settings (userId, captureToken, captureTokenLastUsedAt, updatedAt)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(userId) DO UPDATE SET captureToken = excluded.captureToken,
       captureTokenLastUsedAt = NULL, updatedAt = excluded.updatedAt`
  ).run(userId, token, nowISO());

  return token;
}

export async function revokeCaptureToken(userId: string): Promise<void> {
  await db.prepare(
    `UPDATE user_settings SET captureToken = NULL, captureTokenLastUsedAt = NULL, updatedAt = ? WHERE userId = ?`
  ).run(nowISO(), userId);
}

/**
 * Resolve a bearer token to a user id.
 *
 * Looks the token up directly (indexed — see idx_user_settings_capture_token
 * in db.ts) rather than scanning every row with a capture token: that scan
 * was O(number of users with a capture token) on every single extension
 * request, which doesn't scale. The direct lookup is still followed by a
 * constant-time comparison against the one matched row, so the same
 * timing-attack resistance as before is preserved — tokens are high-entropy
 * enough that this is belt-and-braces, not load-bearing, but it's free.
 */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith("vxs_") || token.length < 16) return null;

  const row = (await db
    .prepare(`SELECT userId, captureToken FROM user_settings WHERE captureToken = ?`)
    .get(token)) as { userId: string; captureToken: string } | undefined;

  if (!row) return null;

  const stored = Buffer.from(row.captureToken);
  const candidate = Buffer.from(token);
  if (stored.length !== candidate.length) return null;
  if (!timingSafeEqual(stored, candidate)) return null;

  // This is the actual "the extension is connected" signal — a token can be
  // copied without error and still never get pasted anywhere, so only a
  // request that authenticates with it proves the setup worked. Best-effort:
  // a capture that already succeeded shouldn't fail over a status timestamp.
  db.prepare(`UPDATE user_settings SET captureTokenLastUsedAt = ? WHERE userId = ?`)
    .run(nowISO(), row.userId)
    .catch(() => {});

  return row.userId;
}

/** Pull a bearer token out of an Authorization header. */
export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
