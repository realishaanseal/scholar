import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { deleteQuestion, scopeOfQuestion } from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { questionId: string };
type CourseScope = { organizationId: string; courseId: string };

async function questionScope({ params }: { params: Params }) {
  const scope = await scopeOfQuestion(params.questionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Remove a question from the bank.
 *
 * The scope comes from the question's own row rather than the URL, so a
 * question id belonging to another institution resolves to *their* course and
 * fails the check — the same reason every other route in here resolves scope
 * from the record instead of trusting the path.
 *
 * Deleting cascades to the quizzes using it, which is why the interface shows
 * how many that is before offering the button.
 */
export const DELETE = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: questionScope },
  async ({ params }) => {
    await deleteQuestion(params.questionId);
    return NextResponse.json({ ok: true });
  }
);
