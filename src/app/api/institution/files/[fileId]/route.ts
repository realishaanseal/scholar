import { NextResponse } from "next/server";
import { institutionalRouteAny, NotFound } from "@/lib/api/guard";
import { coursesReferencingFile, getFile, scopeOfFile } from "@/domains/library";
import { canRenderInline, getBytes } from "@/lib/storage";
import type { Scope } from "@/lib/authz";
import { audit } from "@/lib/governance";

export const runtime = "nodejs";

type Params = { fileId: string };

/**
 * Download a file.
 *
 * Every byte goes through this route rather than being served from a storage
 * URL, and that is the whole point. On object storage the stored key is a
 * public URL; handing it to the client would create a permanent link that
 * bypasses every permission check, survives a student leaving the course, and
 * cannot be revoked. So the URL is never returned and never redirected to: the
 * route reads the bytes and answers with them, every time, for everyone.
 *
 * Reachability is a question about a set of scopes: the same PDF can be
 * attached to an assignment in one course and published as a material in
 * another, and a person entitled through either should get it.
 */
async function scopesForFile({ params }: { params: Params }): Promise<Scope[]> {
  const home = await scopeOfFile(params.fileId);
  if (!home) throw new NotFound();

  const references = await coursesReferencingFile(params.fileId);

  // A file nothing references is unreachable rather than public. Uploads that
  // were never attached, and materials since deleted, fall in here.
  return references.map((r) => ({
    organizationId: home.organizationId,
    courseId: r.courseId,
    ...(r.courseSectionId ? { courseSectionId: r.courseSectionId } : {}),
  }));
}

export const GET = institutionalRouteAny<Params, Scope>(
  // assignment:view is held by teachers for their sections and students for
  // the courses they are enrolled in, which is exactly the set of people who
  // should be able to open a set text.
  { permission: "assignment:view", scopes: scopesForFile },
  async ({ params, userId }) => {
    const file = await getFile(params.fileId);
    if (!file) throw new NotFound();

    const payload = await getBytes(file);
    if (!payload) throw new NotFound();

    // Ordinary reading is not logged — a row per page view would be a
    // surveillance system built accidentally out of a compliance
    // requirement. This one is, because "who opened this student's work" is a
    // question a safeguarding lead can be entitled to an answer to.
    await audit({
      organizationId: file.organizationId,
      actorUserId: userId,
      action: "file:download",
      subjectType: "file",
      subjectId: params.fileId,
      detail: { filename: file.filename },
    });

    // Rendered in the browser only for types that cannot carry a script.
    // Everything else downloads, which is a mild inconvenience rather than
    // giving an uploaded file the run of this application's origin.
    const disposition = canRenderInline(file.mimeType) ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(payload.bytes), {
      headers: {
        "content-type": file.mimeType,
        // The filename is already stripped of quotes, separators and control
        // characters on the way in, so it cannot break out of this header.
        "content-disposition": `${disposition}; filename="${file.filename}"`,
        "content-length": String(file.sizeBytes),
        // Without this a browser may decide a text file is HTML and run it,
        // which would make the content type above decorative.
        "x-content-type-options": "nosniff",
        // Belt and braces: even if something scriptable did get served, this
        // origin grants it nothing.
        "content-security-policy": "default-src 'none'; sandbox",
        // Private: this response was authorized for one person, and a shared
        // cache handing it to the next requester would undo that.
        "cache-control": "private, max-age=300",
      },
    });
  }
);
