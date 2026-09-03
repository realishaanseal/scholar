import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { getSubmission, scopeOfSubmission, type ResourceScope } from "@/domains/assessment";
import { draftMark, latestDraft } from "@/domains/grading/assist";
import { resolveAIConfig } from "@/lib/settings";
import { getOrganizationTime } from "@/domains/identity";
import { BadRequest } from "@/lib/api/guard";
import { enforceRate } from "@/lib/governance";

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

    // Whether student work may leave the building at all is the
    // institution's decision, not this teacher's. Checked on the server for
    // the same reason the submission window is: a hidden button is a
    // courtesy, not a rule.
    const org = await getOrganizationTime(scope.organizationId);
    if (org.aiPolicy === "off") {
      throw new BadRequest(
        "Your institution has not enabled marking assistance. An administrator can turn it on in Settings."
      );
    }

    // Every one of these is a paid call to a model. Limited per teacher
    // rather than per institution, so one person working through a backlog
    // cannot exhaust the allowance of everyone else in the school.
    await enforceRate("ai-draft", userId, 60, 3600);

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
