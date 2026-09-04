import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { getAssignment, scopeOfAssignment, type ResourceScope } from "@/domains/assessment";
import { heldBack, postGrades, unpostGrades } from "@/domains/communication";
import { audit } from "@/lib/governance";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/** How many marks are written but not yet released. */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:grade", scope: assignmentScope },
  async ({ params }) =>
    NextResponse.json({ held: await heldBack(params.assignmentId) })
);

/**
 * Release every mark on this assignment.
 *
 * The action a teacher takes after marking a pile over several days. The
 * count comes back because "posted" without a number is indistinguishable
 * from "posted nothing", and a teacher who has not finished should find out
 * here rather than from a student.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:grade", scope: assignmentScope },
  async ({ params, userId, scope }) => {
    const assignment = await getAssignment(params.assignmentId);
    if (!assignment) throw new NotFound();

    const released = await postGrades(params.assignmentId);

    await audit({
      organizationId: scope.organizationId,
      actorUserId: userId,
      action: "submission:grade",
      subjectType: "assignment:post-grades",
      subjectId: params.assignmentId,
      detail: { released },
    });

    return NextResponse.json({ released, held: await heldBack(params.assignmentId) });
  }
);

/** Hide them again — rare, and occasionally necessary after a marking error. */
export const DELETE = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:grade", scope: assignmentScope },
  async ({ params, userId, scope }) => {
    const hidden = await unpostGrades(params.assignmentId);

    await audit({
      organizationId: scope.organizationId,
      actorUserId: userId,
      action: "submission:grade",
      subjectType: "assignment:unpost-grades",
      subjectId: params.assignmentId,
      detail: { hidden },
    });

    return NextResponse.json({ hidden });
  }
);
