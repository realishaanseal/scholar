import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, readBody, NotFound } from "@/lib/api/guard";
import {
  getAssignment, getSubmission, gradeSchema, gradeSubmission,
  scopeOfSubmission, scoreWithinBounds, type ResourceScope,
} from "@/domains/assessment";
import { latestDraft, resolveDraft } from "@/domains/grading/assist";

export const runtime = "nodejs";

type Params = { submissionId: string };

/**
 * The scope names the student whose work this is.
 *
 * That matters for more than tenancy: including `studentUserId` means the
 * policy engine applies its "a student may act on their own record and no one
 * else's" rule here too, so a student who guesses a classmate's submission id
 * is refused by the same check that governs teachers.
 */
async function submissionScope({ params }: { params: Params }) {
  const scope = await scopeOfSubmission(params.submissionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Record a grade.
 *
 * `assignment:grade` is held by teachers and teaching assistants, and bound to
 * the section they actually teach. The grader's id is taken from the session,
 * never from the body — a grade is a claim about who made a judgement, and
 * letting the caller name someone else would make the audit trail fiction.
 *
 * An AI may draft a score and feedback upstream of this, but nothing reaches
 * the database until a person posts it here. There is no code path that writes
 * a score without a human's id attached.
 */
export const POST = institutionalRoute<Params, ResourceScope & { studentUserId: string }>(
  { permission: "assignment:grade", scope: submissionScope },
  async ({ req, params, userId }) => {
    const input = await readBody(req, gradeSchema);

    const submission = await getSubmission(params.submissionId);
    if (!submission) throw new NotFound();

    // The ceiling depends on the assignment, which the schema cannot know.
    const assignment = await getAssignment(submission.assignmentId);
    if (!scoreWithinBounds(input.score, assignment?.points ?? null)) {
      throw new BadRequest(
        `Score must be between 0 and ${assignment?.points ?? 0}.`
      );
    }

    // A draft is honoured only if it belongs to THIS submission. Without that
    // check a teacher could pass any draft id and attribute a mark to a model
    // that never saw the work — which would put fiction in the audit trail,
    // the one place that must not contain any.
    const draft = input.draftId ? await latestDraft(params.submissionId) : null;
    const usedDraft = draft && draft.id === input.draftId ? draft : null;

    const graded = await gradeSubmission(
      params.submissionId,
      userId,
      input.score,
      input.feedback,
      usedDraft?.model ?? null
    );

    if (usedDraft) {
      // Whether the teacher agreed is worth knowing, and is not something to
      // infer later from timestamps. A score identical to the suggestion is
      // an acceptance; anything else is an edit.
      await resolveDraft(
        usedDraft.id,
        usedDraft.suggestedScore === input.score ? "accepted" : "edited",
        userId,
        input.score
      );
    }

    return NextResponse.json({ submission: graded });
  }
);
