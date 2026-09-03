import { NextResponse } from "next/server";
import { BadRequest, institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import {
  getAssignment, quizForStudent, quizForTeacher, quizQuestionsSchema,
  scopeOfAssignment, setQuizQuestions, type ResourceScope,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * The questions on a quiz.
 *
 * The two audiences get genuinely different objects, not the same object with
 * fields blanked: a teacher gets the questions with their answer keys, and a
 * student gets prompts and option bodies with correctness stripped by the one
 * redaction function that exists for the purpose.
 *
 * Which branch runs is decided by re-asking the policy engine whether this
 * actor could grade here, exactly as the submissions route decides whose work
 * to list. A role string would be the wrong thing to trust; here it would be
 * the wrong thing to trust with the answers.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:view", scope: assignmentScope },
  async ({ params, actor, scope }) => {
    const assignment = await getAssignment(params.assignmentId);
    if (!assignment) throw new NotFound();

    const isStaff = can(actor, "assignment:grade", scope);

    if (isStaff) {
      return NextResponse.json({
        questions: await quizForTeacher(params.assignmentId),
        canManage: true,
      });
    }

    // A student may only meet a quiz that has actually been set.
    if (assignment.status !== "published") throw new NotFound();

    return NextResponse.json({
      questions: await quizForStudent(params.assignmentId),
      canManage: false,
    });
  }
);

/** Choose which questions make up this quiz, and in what order. */
export const PUT = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:update", scope: assignmentScope },
  async ({ req, params, scope }) => {
    const input = await readBody(req, quizQuestionsSchema);

    const assignment = await getAssignment(params.assignmentId);
    if (!assignment) throw new NotFound();

    // Changing the questions under a quiz people have already sat would
    // silently invalidate their marks — the attempt was against a different
    // paper. Published quizzes are edited by unpublishing first.
    if (assignment.status === "published") {
      throw new BadRequest(
        "Unpublish this quiz before changing its questions, so nobody is marked against a paper they did not sit."
      );
    }

    await setQuizQuestions(scope.organizationId, params.assignmentId, input.questionIds);

    return NextResponse.json({ questions: await quizForTeacher(params.assignmentId) });
  }
);
