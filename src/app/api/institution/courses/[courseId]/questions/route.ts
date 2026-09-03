import { NextResponse } from "next/server";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import {
  createQuestion, listQuestions, questionInputSchema, specFromInput,
} from "@/domains/assessment";
import { scopeOfCourse } from "@/domains/library";

export const runtime = "nodejs";

type Params = { courseId: string };
type CourseScope = { organizationId: string; courseId: string };

async function courseScope({ params }: { params: Params }) {
  const scope = await scopeOfCourse(params.courseId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * The question bank for a course.
 *
 * Gated on `course:update` rather than `course:view`, which is stricter than
 * the materials library alongside it and deliberately so: every row here
 * carries the answer key in its spec. There is no student-facing shape of this
 * endpoint at all — a student meets these questions through a quiz they have
 * been set, redacted, and never as a list they can browse.
 */
export const GET = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: courseScope },
  async ({ params }) => {
    const questions = await listQuestions(params.courseId);
    return NextResponse.json({ questions });
  }
);

export const POST = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: courseScope },
  async ({ req, params, userId, scope }) => {
    const input = await readBody(req, questionInputSchema);

    const question = await createQuestion(scope.organizationId, params.courseId, userId, {
      kind: input.kind,
      prompt: input.prompt,
      points: input.points,
      spec: specFromInput(input),
      explanation: input.explanation,
    });

    return NextResponse.json({ question }, { status: 201 });
  }
);
