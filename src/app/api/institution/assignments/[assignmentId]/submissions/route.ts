import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import {
  evaluateSubmission, getAssignment, listOwnSubmissions, listSubmissions,
  scopeOfAssignment, submitWorkSchema, upsertSubmission, type ResourceScope,
  isSetFor,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Submissions for one assignment.
 *
 * A teacher gets the whole queue; a student gets only their own attempts. The
 * gate is `submission:view`, which both hold for their own reason, so which
 * list to return is decided by re-asking the policy engine whether this actor
 * could grade here. Trusting a role string would mean a student enrolled in
 * the section seeing their classmates' work.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "submission:view", scope: assignmentScope },
  async ({ params, actor, scope, userId }) => {
    const isStaff = can(actor, "assignment:grade", scope);
    const submissions = isStaff
      ? await listSubmissions(params.assignmentId)
      : await listOwnSubmissions(params.assignmentId, userId);
    return NextResponse.json({ submissions, canGrade: isStaff });
  }
);

/**
 * Hand work in.
 *
 * The window is evaluated on the server against the assignment's own dates.
 * A client can hide a disabled button; only this decides whether late work is
 * accepted, and it is the same pure function the interface uses to explain
 * what is about to happen.
 *
 * Lateness is stamped here rather than derived on read, because a deadline can
 * move afterwards and lateness is a fact about when the work actually arrived.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "submission:create", scope: assignmentScope },
  async ({ req, params, userId }) => {
    const input = await readBody(req, submitWorkSchema);

    const assignment = await getAssignment(params.assignmentId);
    if (!assignment) throw new NotFound();
    if (assignment.status !== "published") {
      // A draft is the teacher still writing. Nothing to submit against.
      throw new NotFound();
    }

    // A hidden assignment is a courtesy; a refused POST is the rule. Somebody
    // who guesses an id must not be able to hand in work set for a classmate.
    if (!(await isSetFor(params.assignmentId, userId))) throw new NotFound();

    const verdict = evaluateSubmission(
      {
        availableFrom: assignment.availableFrom,
        dueAt: assignment.dueAt,
        closesAt: assignment.closesAt,
        latePolicy: assignment.latePolicy,
      },
      new Date()
    );

    if (!verdict.accepted) {
      throw new BadRequest(
        verdict.reason === "not-open-yet"
          ? "This work is not open for submission yet."
          : verdict.reason === "closed"
            ? "Submissions for this work have closed."
            : "The deadline has passed and this work does not accept late submissions."
      );
    }

    if (!input.body.trim() && !input.url) {
      throw new BadRequest("Write something or attach a link before submitting.");
    }

    // Attempts are counted from what already exists rather than sent by the
    // client, which would otherwise be able to overwrite an earlier one.
    const previous = await listOwnSubmissions(params.assignmentId, userId);
    const attempt = previous.length + 1;

    if (assignment.maxAttempts !== null && previous.length >= assignment.maxAttempts) {
      throw new BadRequest(
        `You have used all ${assignment.maxAttempts} attempt${
          assignment.maxAttempts === 1 ? "" : "s"
        } for this work.`
      );
    }

    const submission = await upsertSubmission(
      assignment.organizationId,
      params.assignmentId,
      userId,
      { body: input.body, url: input.url, attempt, isLate: verdict.late }
    );

    return NextResponse.json({ submission, late: verdict.late }, { status: 201 });
  }
);
