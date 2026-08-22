import { randomBytes } from "node:crypto";
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
 *
 * The token itself lives at `users/{uid}/settings/captureToken`. Resolving a
 * token back to a user needs the reverse direction — the extension only has
 * the token, not the uid — so a top-level `captureTokens/{token}` collection
 * acts as an index (one doc read instead of the original's full user-table
 * scan). This collection is never exposed to Firestore security rules for
 * client access; only server code (which uses the Admin SDK and bypasses rules
 * entirely) ever touches it.
 */

function captureTokenDoc(userId: string) {
  return db.collection("users").doc(userId).collection("settings").doc("captureToken");
}
function tokenIndexDoc(token: string) {
  return db.collection("captureTokens").doc(token);
}

export async function getCaptureToken(userId: string): Promise<string | null> {
  const snap = await captureTokenDoc(userId).get();
  if (!snap.exists) return null;
  return (snap.data() as { token: string | null }).token ?? null;
}

export async function ensureCaptureToken(userId: string): Promise<string> {
  const existing = await getCaptureToken(userId);
  if (existing) return existing;
  return rotateCaptureToken(userId);
}

export async function rotateCaptureToken(userId: string): Promise<string> {
  const token = `vxs_${randomBytes(24).toString("base64url")}`;
  const previous = await getCaptureToken(userId);

  const batch = db.batch();
  batch.set(captureTokenDoc(userId), { token, updatedAt: nowISO() }, { merge: true });
  if (previous) batch.delete(tokenIndexDoc(previous));
  batch.set(tokenIndexDoc(token), { userId });
  await batch.commit();

  return token;
}

export async function revokeCaptureToken(userId: string): Promise<void> {
  const previous = await getCaptureToken(userId);

  const batch = db.batch();
  batch.set(captureTokenDoc(userId), { token: null, updatedAt: nowISO() }, { merge: true });
  if (previous) batch.delete(tokenIndexDoc(previous));
  await batch.commit();
}

/** Resolve a bearer token to a user id. */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith("vxs_") || token.length < 16) return null;

  const snap = await tokenIndexDoc(token).get();
  if (!snap.exists) return null;
  return (snap.data() as { userId: string }).userId;
}

/** Pull a bearer token out of an Authorization header. */
export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
