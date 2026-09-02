import { NextResponse } from "next/server";
import { institutionalRouteAny, NotFound } from "@/lib/api/guard";
import { coursesReferencingFile, getFile, scopeOfFile } from "@/domains/library";
import { getBytes } from "@/lib/storage";
import type { Scope } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { fileId: string };

/**
 * Download a file.
 *
 * Every byte goes through this route rather than being served from a storage
 * URL, and that is the whole point. On object storage the stored key is a
 * public URL; handing it to the client would create a permanent link that
 * bypasses every permission check, survives a student leaving the course, and
 * cannot be revoked. So the URL is never returned — the route reads the file
 * and answers with the bytes, or redirects to a URL only after deciding the
 * caller is allowed to have it.
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
  async ({ params }) => {
    const file = await getFile(params.fileId);
    if (!file) throw new NotFound();

    const payload = await getBytes(file);
    if (!payload) throw new NotFound();

    if (payload.kind === "redirect") {
      // Only reached after the permission check above.
      return NextResponse.redirect(payload.url);
    }

    return new NextResponse(new Uint8Array(payload.bytes), {
      headers: {
        "content-type": file.mimeType,
        // The filename is already stripped of quotes, separators and control
        // characters on the way in, so it cannot break out of this header.
        "content-disposition": `inline; filename="${file.filename}"`,
        "content-length": String(file.sizeBytes),
        // Private: this response was authorized for one person, and a shared
        // cache handing it to the next requester would undo that.
        "cache-control": "private, max-age=300",
      },
    });
  }
);
