import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import {
  createFile, createMaterial, listMaterials, materialInputSchema, scopeOfCourse,
  type MaterialKind,
} from "@/domains/library";
import {
  describeLimit, isAllowedType, maxUploadBytes, safeFilename,
} from "@/lib/storage";

export const runtime = "nodejs";

type Params = { courseId: string };
type CourseScope = { organizationId: string; courseId: string };

async function courseScope({ params }: { params: Params }) {
  const scope = await scopeOfCourse(params.courseId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * The course library.
 *
 * Staff see everything including unpublished drafts; students see only what
 * has been published. Which one the caller is is decided by re-asking the
 * policy engine rather than by reading a role, so a teaching assistant with
 * course:update rights gets the staff view without anyone maintaining a
 * second list of who counts as staff.
 */
export const GET = institutionalRoute<Params, CourseScope>(
  { permission: "course:view", scope: courseScope },
  async ({ params, actor, scope }) => {
    const isStaff = can(actor, "course:update", scope);
    const materials = await listMaterials(params.courseId, { publishedOnly: !isStaff });

    return NextResponse.json({
      materials: materials.map((m) => ({
        ...m,
        // Never the storage key: on object storage that is a public URL, and
        // returning it would hand out a link nothing can revoke.
        downloadUrl: m.fileId ? `/api/institution/files/${m.fileId}` : null,
      })),
      canManage: isStaff,
    });
  }
);

/**
 * Add a material — either an uploaded file or a link.
 *
 * Accepts multipart when a file is being uploaded and JSON when it is a link,
 * because sending a 40MB textbook as base64 inside a JSON body would inflate
 * it by a third for no reason.
 */
export const POST = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: courseScope },
  async ({ req, params, userId, scope }) => {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const input = await readBody(req, materialInputSchema);
      const material = await createMaterial(scope.organizationId, params.courseId, input);
      return NextResponse.json({ material }, { status: 201 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) throw new BadRequest("Send the material as a file upload or as JSON.");

    const file = form.get("file");
    if (!(file instanceof File)) throw new BadRequest("Choose a file to upload.");

    const limit = maxUploadBytes();
    if (file.size > limit) {
      throw new BadRequest(`${safeFilename(file.name)} is too large. ${describeLimit()}`);
    }
    if (file.size === 0) throw new BadRequest("That file is empty.");

    const mime = file.type || "application/octet-stream";
    if (!isAllowedType(mime)) {
      throw new BadRequest(
        `${safeFilename(file.name)} is not a type that can be handed out (${mime}). ` +
          "PDFs, EPUBs, documents, slides and images are fine."
      );
    }

    const record = await createFile(scope.organizationId, userId, {
      filename: file.name,
      mimeType: mime,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    // The title defaults to the filename, because being made to type "Chapter
    // 4.pdf" into a box after choosing Chapter 4.pdf is busywork.
    const title = String(form.get("title") ?? "").trim() || record.filename;
    const kindRaw = String(form.get("kind") ?? "document");
    const kind = (["ebook", "document", "slides", "worksheet", "video", "link"] as const)
      .includes(kindRaw as MaterialKind)
      ? (kindRaw as MaterialKind)
      : "document";

    const material = await createMaterial(scope.organizationId, params.courseId, {
      title,
      description: String(form.get("description") ?? "").trim().slice(0, 2000),
      kind,
      fileId: record.id,
      url: null,
    });

    return NextResponse.json(
      { material: { ...material, downloadUrl: `/api/institution/files/${record.id}` } },
      { status: 201 }
    );
  }
);
