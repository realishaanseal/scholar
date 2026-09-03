import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { getSubmission, scopeOfSubmission, type ResourceScope } from "@/domains/assessment";
import { draftMark, latestDraft } from "@/domains/grading/assist";
import { resolveAIConfig } from "@/lib/settings";

export const runtime = "nodejs";

type Params = { submissionId: string };

async function submissionScope({ params }: { params: Params }) {
  const scope = await scopeOfSubmission(params.submissionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Ask for a suggested mark.
 *
 * Guarded by `assignment:grade` — the same permission as recording a real one,
 * because a suggestion contains a judgement about a named student's work and
 * is not a lesser thing to hand out. Nobody who could not mark this can see a
 * draft of the mark.
 *
 * This endpoint cannot change a score. It writes to grade_drafts and nowhere
 * else; the mark is recorded when the teacher posts to the grade route, having
 * read this and decided. A caller who requests a draft and then closes the tab
 * has altered nothing about the student's standing.
 */
export const POST = institutionalRoute<Params, ResourceScope & { studentUserId: string }>(
  { permission: "assignment:grade", scope: submissionScope },
  async ({ params, userId, scope }) => {
    const submission = await getSubmission(params.submissionId);
    if (!submission) throw new NotFound();

    const draft = await draftMark({
      organizationId: scope.organizationId,
      submissionId: params.submissionId,
      requestedBy: userId,
      config: await resolveAIConfig(userId),
    });

    return NextResponse.json({ draft }, { status: 201 });
  }
);

/** The newest suggestion, so reopening the marking screen does not re-ask. */
export const GET = institutionalRoute<Params, ResourceScope & { studentUserId: string }>(
  { permission: "assignment:grade", scope: submissionScope },
  async ({ params }) => {
    return NextResponse.json({ draft: await latestDraft(params.submissionId) });
  }
);
