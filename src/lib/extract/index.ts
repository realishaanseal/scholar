/**
 * Turn an uploaded file into something the AI can reason about.
 *
 * Two outcomes are possible and they're deliberately distinguished:
 *   - `text`  — we pulled readable text out locally (PDF, DOCX, plain text).
 *   - `image` — no local text, but the file is visual, so it's handed to a
 *               vision-capable model as an image instead.
 *
 * Anything else returns `unsupported` with a reason the UI can show. Nothing
 * here throws on a malformed file: a corrupt upload must not take down the
 * request that contains it.
 */

export type ExtractedContent =
  | { kind: "text"; text: string; pages?: number; truncated: boolean }
  | { kind: "image"; base64: string; mimeType: string }
  | { kind: "unsupported"; reason: string };

/** Cap on extracted text handed to a model, in characters. Roughly 15k tokens. */
const MAX_TEXT_CHARS = 60_000;

const TEXTUAL_MIME = /^text\/|application\/(json|xml|x-yaml|yaml|csv)/i;
const TEXTUAL_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|rtf|tex|html?|log)$/i;
const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i;

export async function extractContent(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ExtractedContent> {
  const name = filename.toLowerCase();

  try {
    if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
      return await extractPdf(buffer);
    }

    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      return await extractDocx(buffer);
    }

    if (IMAGE_MIME.test(mimeType) || IMAGE_EXT.test(name)) {
      return {
        kind: "image",
        base64: buffer.toString("base64"),
        mimeType: normaliseImageMime(mimeType, name),
      };
    }

    if (TEXTUAL_MIME.test(mimeType) || TEXTUAL_EXT.test(name)) {
      return asText(buffer.toString("utf8"));
    }

    // Legacy .doc is a binary format mammoth can't read; say so precisely
    // rather than returning mojibake and letting the model hallucinate from it.
    if (name.endsWith(".doc")) {
      return { kind: "unsupported", reason: "Old .doc format — save it as .docx or PDF and try again." };
    }

    // Unknown type: if it looks like text, treat it as text. Many files carry a
    // useless generic mime type (application/octet-stream) but are perfectly readable.
    const sniffed = buffer.subarray(0, 2048).toString("utf8");
    if (looksLikeText(sniffed)) return asText(buffer.toString("utf8"));

    return { kind: "unsupported", reason: `Can't read ${mimeType || "this file type"} yet.` };
  } catch (err: any) {
    return { kind: "unsupported", reason: friendlyError(err) };
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractedContent> {
  // Imported lazily: pdf-parse pulls in a large PDF engine, and most uploads
  // aren't PDFs. Keeping it out of the module graph keeps cold starts down.
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = (result?.text ?? "").trim();

    // A scanned PDF parses fine but yields almost no text. That's not a failure
    // — it means the content is pictorial, so route it to vision instead.
    if (text.length < 40) {
      return {
        kind: "unsupported",
        reason: "This PDF has no selectable text — it's probably a scan. Upload a photo of it instead and Scholar will read the image.",
      };
    }

    return { ...asText(text), pages: result?.total };
  } finally {
    await parser.destroy?.().catch(() => {});
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedContent> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = (result?.value ?? "").trim();
  if (!text) return { kind: "unsupported", reason: "That document appears to be empty." };
  return asText(text);
}

function asText(raw: string): { kind: "text"; text: string; truncated: boolean } {
  // Collapse the runs of blank lines that PDF extraction tends to produce —
  // they burn tokens without carrying meaning.
  const cleaned = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = cleaned.length > MAX_TEXT_CHARS;
  return {
    kind: "text",
    text: truncated ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned,
    truncated,
  };
}

function looksLikeText(sample: string): boolean {
  if (!sample) return false;
  // A null byte means binary. So does a high proportion of replacement
  // characters, which is what invalid UTF-8 decodes to.
  if (sample.includes("\u0000")) return false;
  const weird = (sample.match(/\uFFFD/g) ?? []).length;
  return weird / sample.length < 0.05;
}


function normaliseImageMime(mimeType: string, name: string): string {
  if (IMAGE_MIME.test(mimeType)) return mimeType.toLowerCase();
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  return "image/jpeg";
}

function friendlyError(err: any): string {
  const message = String(err?.message ?? err ?? "");
  if (/password|encrypt/i.test(message)) return "That file is password-protected, so it can't be read.";
  if (/invalid|corrupt|malformed/i.test(message)) return "That file looks corrupted and couldn't be opened.";
  return "That file couldn't be read.";
}
