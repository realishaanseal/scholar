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

export async function ensureCaptureToken(userId: string): Promise<string> {
  const existing = await getCaptureToken(userId);
  if (existing) return existing;
  return rotateCaptureToken(userId);
}

export async function rotateCaptureToken(userId: string): Promise<string> {
  const token = `vxs_${randomBytes(24).toString("base64url")}`;

  await db.prepare(
    `INSERT INTO user_settings (userId, captureToken, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET captureToken = excluded.captureToken, updatedAt = excluded.updatedAt`
  ).run(userId, token, nowISO());

  return token;
}

export async function revokeCaptureToken(userId: string): Promise<void> {
  await db.prepare(`UPDATE user_settings SET captureToken = NULL, updatedAt = ? WHERE userId = ?`)
    .run(nowISO(), userId);
}

/**
 * Resolve a bearer token to a user id.
 *
 * Comparison is constant-time. Tokens are high-entropy so a timing attack is
 * already impractical, but the cost of doing it properly is one function call.
 */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith("vxs_") || token.length < 16) return null;

  const rows = (await db
    .prepare(`SELECT userId, captureToken FROM user_settings WHERE captureToken IS NOT NULL`)
    .all()) as Array<{ userId: string; captureToken: string }>;

  const candidate = Buffer.from(token);

  for (const row of rows) {
    const stored = Buffer.from(row.captureToken);
    if (stored.length !== candidate.length) continue;
    if (timingSafeEqual(stored, candidate)) return row.userId;
  }
  return null;
}

/** Pull a bearer token out of an Authorization header. */
export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
