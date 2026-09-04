import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import { scopeOfSection, type ResourceScope } from "@/domains/assessment";
import { announce, announcementsFor, sectionAnnouncements } from "@/domains/communication";

export const runtime = "nodejs";

type Params = { sectionId: string };

async function sectionScope({ params }: { params: Params }) {
  const scope = await scopeOfSection(params.sectionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * What has been said to this class.
 *
 * Staff see drafts as well as posted ones; a student sees only what has been
 * published, and sees the institution's announcements in the same list —
 * because "what do I need to know" is one question, and making somebody check
 * two places is how they check neither.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "course:view", scope: sectionScope },
  async ({ params, actor, scope }) => {
    const isStaff = can(actor, "assignment:create", scope);
    return NextResponse.json({
      announcements: isStaff
        ? await sectionAnnouncements(params.sectionId)
        : await announcementsFor(scope.organizationId, params.sectionId),
      canPost: isStaff,
    });
  }
);

const postSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(200),
  body: z.string().trim().max(20_000).default(""),
  /** False saves a draft. Publishing is the default because it is the point. */
  publish: z.boolean().default(true),
});

export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:create", scope: sectionScope },
  async ({ req, params, userId, scope }) => {
    const input = await readBody(req, postSchema);

    const announcement = await announce({
      organizationId: scope.organizationId,
      sectionId: params.sectionId,
      title: input.title,
      body: input.body,
      createdBy: userId,
      // The label is resolved from the user row inside announce(), and kept
      // beside the id so a departed teacher's notice stays legible rather
      // than becoming anonymous.
      publish: input.publish,
    });

    return NextResponse.json({ announcement }, { status: 201 });
  }
);
