import { NextResponse } from "next/server";
import { institutionalRoute, readBody, NotFound } from "@/lib/api/guard";
import {
  assignmentInputSchema, createAssignment, listAssignments, listPublishedAssignments,
  scopeOfSection, type ResourceScope,
} from "@/domains/assessment";
import { can } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { sectionId: string };

/**
 * The scope comes from the section row, never from the request.
 *
 * A caller naming a section in another institution resolves to *that*
 * institution, where they hold no membership, so the check refuses it. If the
 * organization came from a query parameter the caller could simply name their
 * own and read anyone's coursework.
 */
async function sectionScope({ params }: { params: Params }) {
  const scope = await scopeOfSection(params.sectionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * List assignments in a section.
 *
 * Both teachers and students reach this, and they must not see the same thing:
 * a draft is a teacher still writing. The permission gate is `assignment:view`,
 * which students hold for sections they are enrolled in, so the draft filter is
 * applied separately by asking whether this actor could create assignments here.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:view", scope: sectionScope },
  async ({ params, actor, scope }) => {
    const isStaff = can(actor, "assignment:create", scope);
    const assignments = isStaff
      ? await listAssignments(params.sectionId)
      : await listPublishedAssignments(params.sectionId);
    return NextResponse.json({ assignments });
  }
);

export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:create", scope: sectionScope },
  async ({ req, params, userId, scope }) => {
    const input = await readBody(req, assignmentInputSchema);
    // Created as a draft. Publishing is a separate deliberate act, so nothing
    // reaches a student's dashboard by accident.
    const assignment = await createAssignment(
      scope.organizationId,
      params.sectionId,
      userId,
      input
    );
    return NextResponse.json({ assignment }, { status: 201 });
  }
);
