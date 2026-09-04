import { NextResponse } from "next/server";
import { z } from "zod";
import { BadRequest, institutionalRoute, NotFound, readBody } from "@/lib/api/guard";
import { can } from "@/lib/authz";
import {
  decideExtension, extensionFor, isSetFor, requestExtension, scopeOfAssignment,
  type ResourceScope,
} from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { assignmentId: string };

async function assignmentScope({ params }: { params: Params }) {
  const scope = await scopeOfAssignment(params.assignmentId);
  if (!scope) throw new NotFound();
  return scope;
}

/** What this student has asked for on this assignment, if anything. */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "submission:view", scope: assignmentScope },
  async ({ params, userId }) =>
    NextResponse.json({ request: await extensionFor(params.assignmentId, userId) })
);

const askSchema = z.object({
  /** What Scholar computed when the student pressed the button. */
  workMins: z.number().int().min(0).max(100_000),
  availableMins: z.number().int().min(0).max(100_000),
  message: z.string().trim().max(1000).default(""),
});

/**
 * Ask for more time on one piece of work.
 *
 * Gated on `submission:create`, the permission meaning "this assignment is
 * yours to hand in". Somebody who cannot submit has nothing to ask an
 * extension on, and a member of staff asking themselves for one is not a flow
 * worth supporting.
 *
 * The figures arrive from the client, which is the honest description of what
 * happens and the reason they are bounded and stored as a snapshot rather than
 * trusted as fact. A student could inflate them, and what that buys is a
 * teacher reading a number they can already check against the work they set.
 * The alternative — recomputing a student's private planning totals inside an
 * institutional route — would mean this endpoint reading the personal layer,
 * which is a considerably worse trade for a considerably smaller problem.
 */
export const POST = institutionalRoute<Params, ResourceScope>(
  { permission: "submission:create", scope: assignmentScope },
  async ({ req, params, actor, scope, userId }) => {
    if (can(actor, "assignment:grade", scope)) {
      throw new BadRequest("Staff cannot request an extension on their own assignment.");
    }
    // Differentiated work: this piece may never have been set for them.
    if (!(await isSetFor(params.assignmentId, userId))) throw new NotFound();

    const body = await readBody(req, askSchema);

    const request = await requestExtension({
      organizationId: scope.organizationId!,
      assignmentId: params.assignmentId,
      studentUserId: userId,
      workMins: body.workMins,
      availableMins: body.availableMins,
      message: body.message,
    });

    return NextResponse.json({ request }, { status: 201 });
  }
);

const decisionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  status: z.enum(["granted", "declined"]),
  note: z.string().trim().max(1000).default(""),
});

/**
 * Answer one.
 *
 * Scoped by the assignment rather than by the request id, so the permission
 * check runs against the section the work belongs to. A teacher cannot answer
 * a request on somebody else's class because the scope resolves from the
 * assignment in the path, not from anything the caller supplies.
 *
 * Granting records a decision and does not move the deadline. Scholar does not
 * know what was agreed — a day, a week, until Monday — and a system that
 * guessed would be inventing a date nobody set. The teacher changes the
 * deadline separately, deliberately, if that is what they meant.
 */
export const PATCH = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:grade", scope: assignmentScope },
  async ({ req, scope, userId }) => {
    const body = await readBody(req, decisionSchema);

    await decideExtension({
      id: body.id,
      organizationId: scope.organizationId!,
      decidedBy: userId,
      status: body.status,
      note: body.note,
    });

    return NextResponse.json({ ok: true });
  }
);
