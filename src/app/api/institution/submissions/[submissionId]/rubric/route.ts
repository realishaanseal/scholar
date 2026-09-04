import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import {
  assessmentFor, getAssignment, getSubmission, recordMark, rubricScoreFor,
  scopeOfSubmission, type ResourceScope,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { submissionId: string };

async function submissionScope({ params }: { params: Params }) {
  const scope = await scopeOfSubmission(params.submissionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * How one piece of work did against the rubric.
 *
 * Readable by the student whose work it is as well as by staff — the whole
 * point of a rubric is that the person being marked can see which criterion
 * cost them the mark. The policy engine already refuses a submission that is
 * neither theirs nor in a class they teach, so no extra check is needed here;
 * what would be wrong is showing them a rubric result before the mark is
 * released, and that is decided by the submission's own status.
 */
export const GET = institutionalRoute<Params, ResourceScope & { studentUserId: string }>(
  { permission: "submission:view", scope: submissionScope },
  async ({ params, actor, scope }) => {
    const submission = await getSubmission(params.submissionId);
    if (!submission) throw new NotFound();

    const assignment = await getAssignment(submission.assignmentId);
    if (!assignment?.rubricId) return NextResponse.json({ rubric: null, result: null });

    const isStaff = can(actor, "assignment:grade", scope);

    // A student sees the rubric filled in only once their work has been
    // returned. Before that it is a marker's working-out, and half of it is
    // worse than none.
    if (!isStaff && submission.status !== "returned") {
      const shape = await assessmentFor(params.submissionId, assignment.rubricId);
      return NextResponse.json({
        rubric: shape?.rubric ?? null,
        result: null,
        pending: true,
      });
    }

    const shape = await assessmentFor(params.submissionId, assignment.rubricId);
    return NextResponse.json({ ...shape, canMark: isStaff });
  }
);

const markSchema = z.object({
  criterionId: z.string().trim().min(1).max(64),
  levelId: z.string().trim().min(1).max(64).nullable().default(null),
  points: z.number().min(0).max(10_000).nullable().default(null),
  comment: z.string().trim().max(4000).default(""),
});

/**
 * Record one criterion's judgement.
 *
 * One criterion per request rather than the whole rubric, so a marker's work
 * survives a closed tab and two people moderating the same piece do not
 * overwrite each other wholesale.
 *
 * The response carries what the rubric now implies for the assignment's
 * score, but does not apply it. Writing a grade stays the grade route's job,
 * with its required human actor and its audit entry — a rubric is not a
 * second, quieter way to mark somebody.
 */
export const POST = institutionalRoute<Params, ResourceScope & { studentUserId: string }>(
  { permission: "assignment:grade", scope: submissionScope },
  async ({ req, params, scope }) => {
    const input = await readBody(req, markSchema);

    const submission = await getSubmission(params.submissionId);
    if (!submission) throw new NotFound();
    const assignment = await getAssignment(submission.assignmentId);
    if (!assignment?.rubricId) throw new NotFound();

    await recordMark({
      organizationId: scope.organizationId,
      submissionId: params.submissionId,
      criterionId: input.criterionId,
      levelId: input.levelId,
      points: input.points,
      comment: input.comment,
    });

    const shape = await assessmentFor(params.submissionId, assignment.rubricId);
    if (!shape) throw new NotFound();

    return NextResponse.json({
      result: shape.result,
      suggestedScore: rubricScoreFor(
        shape.result,
        assignment.points,
        assignment.rubricScores
      ),
    });
  }
);
