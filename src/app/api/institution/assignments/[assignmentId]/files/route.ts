import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, NotFound } from "@/lib/api/guard";
import { scopeOfAssignment, type ResourceScope } from "@/domains/assessment";
import { attachToAssignment, createFile, listAssignmentFiles } from "@/domains/library";
import {
  describeLimit, isAllowedType, maxUploadBytes, safeFilename,
} from "@/lib/storage";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Files attached to the brief.
 *
 * Gated on assignment:view, so a student enrolled in the section can fetch the
 * list — the question sheet is the assignment as far as they are concerned,
 * and an attachment nobody but the teacher can see is not an attachment.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:view", scope: assignmentScope },
  async ({ params }) => {
    const files = await listAssignmentFiles(params.assignmentId);
    return NextResponse.json({
      files: files.map(({ storageKey, storageProvider, ...rest }) => ({
        ...rest,
        // The storage key is a URL on object storage. Returning it would hand
        // out a link that bypasses every permission check on the way in.
        downloadUrl: `/api/institution/files/${rest.id}`,
      })),
    });
  }
);

/**
 * Upload and attach a file.
 *
 * Multipart rather than JSON, so a 40MB textbook is not base64-inflated by a
 * third on its way through the request body.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:update", scope: assignmentScope },
  async ({ req, params, userId, scope }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File)) {
      throw new BadRequest("Attach a file to upload.");
    }

    const limit = maxUploadBytes();
    if (file.size > limit) {
      throw new BadRequest(
        `${safeFilename(file.name)} is too large. ${describeLimit()}`
      );
    }
    if (file.size === 0) {
      throw new BadRequest("That file is empty.");
    }

    // An allowlist: these are handed to students, so the question is whether
    // it is coursework, not whether it is dangerous.
    const mime = file.type || "application/octet-stream";
    if (!isAllowedType(mime)) {
      throw new BadRequest(
        `${safeFilename(file.name)} is not a type that can be handed out ` +
          `(${mime}). PDFs, documents, slides, images and EPUBs are fine.`
      );
    }

    const record = await createFile(scope.organizationId, userId, {
      filename: file.name,
      mimeType: mime,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    await attachToAssignment(scope.organizationId, params.assignmentId, record.id);

    return NextResponse.json(
      {
        file: {
          id: record.id,
          filename: record.filename,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
          createdAt: record.createdAt,
          downloadUrl: `/api/institution/files/${record.id}`,
        },
      },
      { status: 201 }
    );
  }
);
