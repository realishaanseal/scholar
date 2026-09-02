import { db, newId } from "@/lib/db";

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

/** Postgres holds bytes inline, so its ceiling is deliberately low. */
export const POSTGRES_MAX_BYTES = 8 * 1024 * 1024;

/** Object storage can take a real textbook. */
export const BLOB_MAX_BYTES = 200 * 1024 * 1024;

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

export type Retrieved =
  | { kind: "bytes"; bytes: Buffer }
  /** The caller should redirect rather than proxy — object storage serves it. */
  | { kind: "redirect"; url: string };

export async function getBytes(file: {
  storageProvider: string;
  storageKey: string;
}): Promise<Retrieved | null> {
  if (file.storageProvider === "vercel-blob") {
    return { kind: "redirect", url: file.storageKey };
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
  "image/svg+xml": "Image",
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
