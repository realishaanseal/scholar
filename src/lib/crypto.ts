import crypto from "node:crypto";

/**
 * API keys are stored encrypted at rest, not in plain text.
 * The encryption key is derived from AUTH_SECRET, which never leaves the server.
 *
 * Format: v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";

function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — it is required to encrypt stored API keys. Run `npx auth secret`."
    );
  }
  // Fixed salt: we need the same key every boot, and the secret itself is the entropy.
  return crypto.scryptSync(secret, "varaxis-scholar-apikey-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== VERSION) return null;

    const decipher = crypto.createDecipheriv(ALGO, secretKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong AUTH_SECRET, or tampered ciphertext — treat as "no key" rather than crashing.
    return null;
  }
}

/** A safe preview for the UI: never the key itself. */
export function hintFor(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "•".repeat(Math.max(trimmed.length, 4));
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
