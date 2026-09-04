import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { createRubric, listUsableRubrics } from "@/domains/assessment";
import { scopeOfCourse } from "@/domains/library";

export const runtime = "nodejs";

type Params = { courseId: string };
type CourseScope = { organizationId: string; courseId: string };

async function courseScope({ params }: { params: Params }) {
  const scope = await scopeOfCourse(params.courseId);
  if (!scope) throw new NotFound();
  return scope;
}

const rubricSchema = z.object({
  title: z.string().trim().min(2, "Give the rubric a name.").max(200),
  description: z.string().trim().max(2000).default(""),
  /** True to share it across the whole institution rather than this course. */
  shared: z.boolean().default(false),
  criteria: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Every criterion needs a name.").max(200),
        description: z.string().trim().max(2000).default(""),
        points: z.number().min(0).max(1000),
        levels: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(120),
              description: z.string().trim().max(2000).default(""),
              points: z.number().min(0).max(1000),
            })
          )
          .max(12)
          .default([]),
      })
    )
    .min(1, "A rubric needs at least one criterion.")
    .max(40),
});

/** Rubrics this course can be marked against: its own, plus shared ones. */
export const GET = institutionalRoute<Params, CourseScope>(
  { permission: "course:view", scope: courseScope },
  async ({ params, scope }) =>
    NextResponse.json({
      rubrics: await listUsableRubrics(scope.organizationId, params.courseId),
    })
);

/**
 * Build a rubric.
 *
 * Criteria and levels arrive with it rather than being added afterwards: a
 * rubric with no criteria is an empty row, and a two-step create would leave
 * one behind every time somebody abandoned the second step.
 */
export const POST = institutionalRoute<Params, CourseScope>(
  { permission: "course:update", scope: courseScope },
  async ({ req, params, userId, scope }) => {
    const input = await readBody(req, rubricSchema);

    const rubric = await createRubric(scope.organizationId, userId, {
      title: input.title,
      description: input.description,
      // Shared means institution-wide, which is what makes a department's
      // essay rubric possible.
      courseId: input.shared ? null : params.courseId,
      criteria: input.criteria,
    });

    return NextResponse.json({ rubric }, { status: 201 });
  }
);
