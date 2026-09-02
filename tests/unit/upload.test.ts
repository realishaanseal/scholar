import { describe, it, expect } from "vitest";
import { sniff, canRenderInline } from "@/lib/storage/sniff";
import { ALLOWED_MIME_TYPES, safeFilename } from "@/lib/storage";

/*
  Uploaded files are handed to students, and the type a browser reports comes
  from the filename — which is the one part of an upload the uploader controls
  completely. So the bytes are the evidence and the declared type is a claim.
*/

const bytes = (...b: number[]) => Buffer.from(b);
const withPad = (...b: number[]) => Buffer.concat([bytes(...b), Buffer.alloc(64)]);

const PDF = withPad(0x25, 0x50, 0x44, 0x46, 0x2d);
const PNG = withPad(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const ZIP = withPad(0x50, 0x4b, 0x03, 0x04);
const EXE = withPad(0x4d, 0x5a, 0x90, 0x00);
const ELF = withPad(0x7f, 0x45, 0x4c, 0x46);

describe("executables are refused however they are named", () => {
  it("refuses a Windows executable claiming to be a PDF", () => {
    // The attack this exists for: rename evil.exe to notes.pdf and let a class
    // download it from a source they trust.
    const v = sniff(EXE, "application/pdf");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("Windows executable");
  });

  it("refuses ELF binaries and shell scripts too", () => {
    expect(sniff(ELF, "application/pdf").ok).toBe(false);
    expect(sniff(Buffer.from("#!/bin/sh\nrm -rf /"), "text/plain").ok).toBe(false);
  });
});

describe("the declared type must match the bytes", () => {
  it("accepts a real PDF declared as a PDF", () => {
    expect(sniff(PDF, "application/pdf")).toEqual({ ok: true, detected: "application/pdf" });
  });

  it("refuses a PNG declared as a PDF", () => {
    expect(sniff(PNG, "application/pdf").ok).toBe(false);
  });

  it("accepts zip-based formats on their container signature", () => {
    // docx, pptx, xlsx and epub are all zips; the first bytes cannot tell them
    // apart, so the container is what gets verified.
    for (const t of [
      "application/epub+zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]) {
      expect(sniff(ZIP, t).ok, t).toBe(true);
    }
  });

  it("refuses a zip-based claim that is not a zip", () => {
    expect(sniff(PDF, "application/epub+zip").ok).toBe(false);
  });
});

describe("text has no signature, so it is checked for what makes text unsafe", () => {
  it("accepts ordinary text", () => {
    expect(sniff(Buffer.from("Chapter 1\nRead pages 4-9."), "text/plain").ok).toBe(true);
  });

  it("refuses text that is actually binary", () => {
    expect(sniff(Buffer.from([0x68, 0x00, 0x69]), "text/plain").ok).toBe(false);
  });

  it("refuses text that starts like markup", () => {
    // A browser that decides this is HTML would run it on our own origin.
    expect(sniff(Buffer.from("<script>alert(1)</script>"), "text/plain").ok).toBe(false);
    expect(sniff(Buffer.from("  <html>"), "text/markdown").ok).toBe(false);
  });
});

describe("what may be rendered in the browser", () => {
  it("renders PDFs and ordinary images", () => {
    for (const t of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      expect(canRenderInline(t), t).toBe(true);
    }
  });

  it("never renders anything scriptable", () => {
    // SVG is the case that matters: an image everywhere else, a scriptable
    // document when served from this origin.
    expect(canRenderInline("image/svg+xml")).toBe(false);
    expect(canRenderInline("text/html")).toBe(false);
    expect(canRenderInline("text/plain")).toBe(false);
  });

  it("does not accept SVG uploads at all", () => {
    expect("image/svg+xml" in ALLOWED_MIME_TYPES).toBe(false);
  });

  it("allows nothing scriptable through the upload allowlist", () => {
    for (const t of Object.keys(ALLOWED_MIME_TYPES)) {
      expect(t, `${t} is scriptable`).not.toMatch(/html|javascript|svg|xhtml/);
    }
  });
});

describe("filenames", () => {
  it("keeps only the basename, so a traversal attempt becomes a plain name", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Windows\\System32\\evil.dll")).toBe("evil.dll");
    // Leading dots are stripped too, so nothing arrives named ".htaccess".
    expect(safeFilename("...hidden.pdf")).toBe("hidden.pdf");
  });

  it("strips quotes and newlines that would break the download header", () => {
    // The name goes into Content-Disposition; a quote or CRLF in it is a
    // header-injection question, not a cosmetic one.
    const out = safeFilename('bad"name\r\nX-Injected: 1.pdf');
    expect(out).not.toContain('"');
    expect(out).not.toContain("\r");
    expect(out).not.toContain("\n");
  });

  it("never returns an empty name", () => {
    expect(safeFilename("...")).toBe("file");
    expect(safeFilename("")).toBe("file");
  });
});
