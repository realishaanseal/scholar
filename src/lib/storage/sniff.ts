/**
 * What a file actually is, as opposed to what it claims to be.
 *
 * `File.type` in a multipart upload is set by the browser from the file
 * extension and is entirely under the caller's control. Trusting it means a
 * Windows executable renamed to `notes.pdf` is stored as `application/pdf` and
 * later served back to a class with that content type. These files are handed
 * to students, so the declared type is treated as a hint and the first bytes
 * as the truth.
 */

export type SniffResult =
  | { ok: true; detected: string }
  | { ok: false; reason: string };

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

/** Signatures for everything the allowlist accepts that has one. */
function detect(buf: Buffer): string | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF

  // Every Office format and EPUB is a zip. Which one it is cannot be told from
  // the first four bytes, so this returns the container and the caller decides
  // whether the declared type is a plausible zip-based format.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    return "application/zip";
  }

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4"; // ....ftyp
  if (startsWith(buf, [0x49, 0x44, 0x33])) return "audio/mpeg"; // ID3
  if (startsWith(buf, [0xff, 0xfb]) || startsWith(buf, [0xff, 0xf3])) return "audio/mpeg";

  // Old Office (.doc, .ppt, .xls) — OLE compound document.
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "application/x-ole-storage";
  }

  return null;
}

/** Formats whose container is a zip. */
const ZIP_BASED = new Set([
  "application/epub+zip",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const OLE_BASED = new Set([
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-excel",
]);

const TEXTUAL = new Set(["text/plain", "text/markdown", "text/csv"]);

/**
 * Signatures that must never be accepted whatever the file claims to be.
 *
 * Blocked by shape rather than by extension, because renaming is free.
 */
const EXECUTABLE_SIGNATURES: { bytes: number[]; what: string }[] = [
  { bytes: [0x4d, 0x5a], what: "a Windows executable" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], what: "a Linux executable" },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], what: "a macOS executable" },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], what: "a macOS executable" },
  { bytes: [0x23, 0x21], what: "a shell script" }, // #!
];

/**
 * Does the content match the claim?
 *
 * Fails closed for anything recognisably executable, and for a declared type
 * whose signature does not match. Text formats have no signature, so they are
 * checked for the things that make text dangerous instead: a null byte means
 * it is not text at all, and a leading `<` means a browser may decide it is
 * HTML no matter what the content type says.
 */
export function sniff(buf: Buffer, declared: string): SniffResult {
  for (const sig of EXECUTABLE_SIGNATURES) {
    if (startsWith(buf, sig.bytes)) {
      return { ok: false, reason: `it is ${sig.what}, whatever it is named` };
    }
  }

  const detected = detect(buf);

  if (ZIP_BASED.has(declared)) {
    return detected === "application/zip"
      ? { ok: true, detected: declared }
      : { ok: false, reason: "it is not the format its name suggests" };
  }

  if (OLE_BASED.has(declared)) {
    return detected === "application/x-ole-storage"
      ? { ok: true, detected: declared }
      : { ok: false, reason: "it is not the format its name suggests" };
  }

  if (TEXTUAL.has(declared)) {
    const head = buf.subarray(0, 1024);
    if (head.includes(0)) {
      return { ok: false, reason: "it contains binary data, not text" };
    }
    const text = head.toString("utf8").trimStart().toLowerCase();
    if (text.startsWith("<")) {
      // A browser that sniffs this as HTML would run it on our own origin.
      return { ok: false, reason: "it looks like markup rather than plain text" };
    }
    return { ok: true, detected: declared };
  }

  if (detected === null) {
    return { ok: false, reason: "its contents are not a recognised format" };
  }
  if (detected !== declared) {
    return { ok: false, reason: "it is not the format its name suggests" };
  }
  return { ok: true, detected };
}

/**
 * May this be rendered in the browser, or must it be downloaded?
 *
 * Serving a file inline from the application's own origin means any script it
 * contains runs with the viewer's session. SVG is the classic case: it is an
 * image everywhere else and a scriptable document here, which is why it is
 * absent from this list even though it is a perfectly reasonable thing for a
 * teacher to upload. Everything not named here is sent as an attachment,
 * which is a mild inconvenience rather than a vulnerability.
 */
const INLINE_SAFE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
]);

export function canRenderInline(mime: string): boolean {
  return INLINE_SAFE.has(mime);
}
