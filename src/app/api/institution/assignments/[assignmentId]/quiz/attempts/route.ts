import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import {
  evaluateSubmission, getAssignment, listOwnSubmissions, quizAttemptSchema,
  reviewAttempt, scopeOfAssignment, submitQuizAttempt, type ResourceScope,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Sit a quiz.
 *
 * Everything that decides the outcome happens here. The client posts what was
 * picked and typed; it is never asked what that was worth, and the answer key
 * it would need in order to lie was never sent to it. Marking loads the
 * questions fresh from the database and runs the same pure function the tests
 * cover.
 *
 * The window and the attempt count are checked server-side for the same reason
 * they are on the written-work route: a disabled button is a courtesy, not a
 * rule.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "submission:create", scope: assignmentScope },
  async ({ req, params, userId, scope }) => {
    const input = await readBody(req, quizAttemptSchema);

    const assignment = await getAssignment(params.assignmentId);
    if (!assignment) throw new NotFound();
    if (assignment.status !== "published") throw new NotFound();
    if (assignment.kind !== "quiz") {
      throw new BadRequest("This work is not a quiz.");
    }

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
          ? "This quiz has not opened yet."
          : verdict.reason === "closed"
            ? "This quiz has closed."
            : "The deadline has passed and this quiz does not accept late attempts."
      );
    }

    // Counted from what exists rather than sent by the client, which would
    // otherwise be able to overwrite a worse earlier attempt.
    const previous = await listOwnSubmissions(params.assignmentId, userId);
    const attempt = previous.length + 1;

    if (assignment.maxAttempts !== null && previous.length >= assignment.maxAttempts) {
      throw new BadRequest(
        `You have used all ${assignment.maxAttempts} attempt${
          assignment.maxAttempts === 1 ? "" : "s"
        } at this quiz.`
      );
    }

    const outcome = await submitQuizAttempt({
      organizationId: scope.organizationId,
      assignmentId: params.assignmentId,
      userId,
      attempt,
      isLate: verdict.late,
      responses: input.responses,
    });

    return NextResponse.json(
      {
        ...outcome,
        late: verdict.late,
        // Right answers and explanations, but only for an attempt the machine
        // has already finished marking. While a person still owes the student
        // a mark on one question, sending the key back would leak it for the
        // attempts they have left.
        review: outcome.needsReview ? null : await reviewAttempt(outcome.submissionId),
      },
      { status: 201 }
    );
  }
);
