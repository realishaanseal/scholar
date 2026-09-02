import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { listSubmissions, scopeOfAssignment, type ResourceScope } from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

/**
 * Every submission for one assignment — the grading queue.
 *
 * Gated on submission:view, which is course-bound, so a teacher sees only the
 * sections they teach. Students do hold submission:view, but their scope
 * carries no studentUserId here, and the policy engine refuses a teacher-style
 * roster read for them: a student asking this question about a section they
 * are in would otherwise see their classmates' work.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  {
    permission: "assignment:grade",
    scope: async ({ params }) => {
      const scope = await scopeOfAssignment(params.assignmentId);
      if (!scope) throw new NotFound();
      return scope;
    },
  },
  async ({ params }) => {
    const submissions = await listSubmissions(params.assignmentId);
    return NextResponse.json({ submissions });
  }
);
