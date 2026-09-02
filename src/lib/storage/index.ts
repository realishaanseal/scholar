import { db, newId } from "@/lib/db";
// Imported as well as re-exported: `export { x } from "./y"` forwards the name
// without binding it locally, so validateUpload below could not see it.
import { sniff } from "./sniff";

/**
 * Where uploaded bytes live.
 *
 * Two providers, chosen at runtime by whether object storage is configured:
 *
 *   postgres     — bytes as base64 in a table. Works with no setup at all,
 *                  which matters because a fresh clone should be able to
 *                  upload a worksheet without provisioning anything. Capped
 *                  low on purpose; Postgres is not a filesystem.
 *   vercel-blob  — real object storage. Used the moment
 *                  BLOB_READ_WRITE_TOKEN exists, with no code change.
 *
 * The provider is recorded per file rather than assumed globally, so turning
 * object storage on does not orphan everything uploaded before it. Old rows
 * keep saying "postgres" and keep working.
 */

export type StorageProvider = "postgres" | "vercel-blob";

export type StoredFile = {
  provider: StorageProvider;
  /** Opaque to callers: a row id for Postgres, an object pathname for Blob. */
  key: string;
  size: number;
};

/**
 * Postgres holds bytes inline, so its ceiling stays conservative.
 *
 * Raised from 8MB to 32MB, which covers the great majority of set texts and
 * scanned worksheets. It is not raised further because base64 inflates by a
 * third — a 32MB PDF occupies about 43MB of row — and a database is a poor
 * filesystem however large you let the column grow. Real textbooks want the
 * object-storage path below.
 */
export const POSTGRES_MAX_BYTES = 32 * 1024 * 1024;

/** Object storage can take a real textbook. */
export const BLOB_MAX_BYTES = 500 * 1024 * 1024;

export function activeProvider(): StorageProvider {
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "postgres";
}

export function maxUploadBytes(): number {
  return activeProvider() === "vercel-blob" ? BLOB_MAX_BYTES : POSTGRES_MAX_BYTES;
}

/**
 * Why an upload was refused, in words a teacher can act on.
 *
 * "File too large" invites the reasonable question "then what is the limit",
 * and on the Postgres provider the honest answer includes that the limit is
 * low because object storage has not been set up.
 */
export function describeLimit(): string {
  return activeProvider() === "vercel-blob"
    ? `Up to ${Math.round(BLOB_MAX_BYTES / 1024 / 1024)}MB.`
    : `Up to ${Math.round(POSTGRES_MAX_BYTES / 1024 / 1024)}MB. ` +
        "Larger files need object storage — set BLOB_READ_WRITE_TOKEN to raise this.";
}

/* ── Writing ───────────────────────────────────────────────────────────── */

export async function putBytes(
  organizationId: string,
  filename: string,
  bytes: Buffer,
  contentType: string
): Promise<StoredFile> {
  const provider = activeProvider();

  if (provider === "vercel-blob") {
    // Imported dynamically so the SDK is not a hard dependency of every build
    // that never uploads anything.
    const { put } = await import("@vercel/blob");
    // Scoped by organization, and suffixed with a random component by the SDK
    // so two teachers uploading "notes.pdf" do not collide.
    const result = await put(`org/${organizationId}/${filename}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return { provider, key: result.url, size: bytes.byteLength };
  }

  const key = newId();
  await db
    .prepare(`INSERT INTO file_bytes (file_id, data) VALUES (?, ?)`)
    .run(key, bytes.toString("base64"));
  return { provider, key, size: bytes.byteLength };
}

/* ── Reading ───────────────────────────────────────────────────────────── */

export type Retrieved = { kind: "bytes"; bytes: Buffer };

/**
 * Fetch the bytes, wherever they are.
 *
 * Object-storage content is proxied rather than redirected to, and that is a
 * deliberate cost. A Vercel Blob URL is public and permanent: it is only
 * unguessable, not protected. Redirecting to it would authorize the request
 * once and then hand over a link that keeps working forever — after the
 * assignment is withdrawn, after the student leaves the course, for anyone
 * they forward it to. Streaming through this process means every single
 * download is authorized, at the price of the bandwidth passing through.
 *
 * If that cost ever becomes the problem, the fix is signed short-lived URLs,
 * not an unguarded redirect.
 */
export async function getBytes(file: {
  storageProvider: string;
  storageKey: string;
}): Promise<Retrieved | null> {
  if (file.storageProvider === "vercel-blob") {
    const res = await fetch(file.storageKey);
    if (!res.ok) return null;
    return { kind: "bytes", bytes: Buffer.from(await res.arrayBuffer()) };
  }

  const row = await db
    .prepare(`SELECT data FROM file_bytes WHERE file_id = ?`)
    .get(file.storageKey);
  if (!row) return null;
  return { kind: "bytes", bytes: Buffer.from(row.data, "base64") };
}

/* ── Deleting ──────────────────────────────────────────────────────────── */

export async function deleteBytes(file: {
  storageProvider: string;
  storageKey: string;
}): Promise<void> {
  if (file.storageProvider === "vercel-blob") {
    const { del } = await import("@vercel/blob");
    // A file already gone is the desired end state, not an error.
    await del(file.storageKey).catch(() => {});
    return;
  }
  await db.prepare(`DELETE FROM file_bytes WHERE file_id = ?`).run(file.storageKey);
}

/* ── What may be uploaded ──────────────────────────────────────────────── */

/**
 * An allowlist, not a blocklist.
 *
 * These files are handed to students, so the question is not "is this
 * dangerous" but "is this coursework". Anything executable or scriptable is
 * absent rather than explicitly banned, which is what makes the list safe as
 * it grows.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/epub+zip": "EPUB",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/msword": "Word",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.ms-excel": "Excel",
  "text/plain": "Text",
  "text/markdown": "Markdown",
  "text/csv": "CSV",
  "image/png": "Image",
  "image/jpeg": "Image",
  "image/webp": "Image",
  "image/gif": "Image",
  // SVG is deliberately absent. It is an image everywhere else and a
  // scriptable document here: served from this application's origin, a script
  // inside one would run with the viewer's session. See sniff.ts.
  "audio/mpeg": "Audio",
  "audio/mp4": "Audio",
  "video/mp4": "Video",
  "application/zip": "Archive",
};

export function isAllowedType(mime: string): boolean {
  return mime in ALLOWED_MIME_TYPES;
}

export function describeType(mime: string): string {
  return ALLOWED_MIME_TYPES[mime] ?? "File";
}

/**
 * Strip anything from a filename that could mean something to a filesystem.
 *
 * The name is shown to students and used in a Content-Disposition header, so a
 * path separator or a control character in it is a header-injection and
 * path-traversal question rather than a cosmetic one.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"'`;\r\n]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || "file";
}

export { sniff, canRenderInline, type SniffResult } from "./sniff";

/**
 * Validate an upload end to end.
 *
 * Gathers every refusal reason into one place so the two upload routes cannot
 * drift apart on what they accept — the usual way an allowlist develops a hole
 * is by existing in two copies.
 */
export function validateUpload(
  file: { name: string; size: number; type: string },
  bytes: Buffer
): { ok: true; mimeType: string } | { ok: false; message: string } {
  const name = safeFilename(file.name);

  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > maxUploadBytes()) {
    return { ok: false, message: `${name} is too large. ${describeLimit()}` };
  }

  const declared = file.type || "application/octet-stream";
  if (!isAllowedType(declared)) {
    return {
      ok: false,
      message:
        `${name} is not a type that can be handed out (${declared}). ` +
        "PDFs, EPUBs, documents, slides and images are fine.",
    };
  }

  // The declared type came from the browser, which derived it from the file
  // extension. The bytes are the only part the uploader cannot rename.
  const verdict = sniff(bytes, declared);
  if (!verdict.ok) {
    return { ok: false, message: `${name} was rejected because ${verdict.reason}.` };
  }

  return { ok: true, mimeType: verdict.detected };
}
