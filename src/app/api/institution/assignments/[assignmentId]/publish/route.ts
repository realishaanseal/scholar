import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import {
  publishAssignment, scopeOfAssignment, syncProjection, unpublishAssignment,
  type ResourceScope,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Publish an assignment.
 *
 * This is the moment the two halves of the product meet: the work becomes
 * visible in the course, and a Scholar task appears on the dashboard of every
 * actively enrolled student, carrying the deadline but leaving their own
 * estimate, priority and planning alone.
 *
 * The response reports how many students it reached, because "published"
 * without a number gives a teacher no way to notice they published to an
 * empty section.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:update", scope: assignmentScope },
  async ({ params }) => {
    const assignment = await publishAssignment(params.assignmentId);
    const { projected } = await syncProjection(params.assignmentId);
    return NextResponse.json({ assignment, projectedToStudents: projected });
  }
);

/**
 * Withdraw an assignment.
 *
 * The students' tasks are archived rather than deleted — they may have logged
 * real time against the work, and erasing that would erase a record of
 * something they genuinely did.
 */
export const DELETE = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:update", scope: assignmentScope },
  async ({ params }) => {
    const assignment = await unpublishAssignment(params.assignmentId);
    return NextResponse.json({ assignment });
  }
);
