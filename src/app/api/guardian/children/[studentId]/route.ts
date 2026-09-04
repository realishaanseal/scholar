import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { digestFor } from "@/domains/guardians";
import { audit } from "@/lib/governance";
import { db } from "@/lib/db";
import type { Scope } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { studentId: string };

/**
 * The scope names the child.
 *
 * That is the whole of a guardian's authorization: the policy engine refuses
 * any guardian check that does not name a student, and refuses this one
 * unless the caller is a guardian of that student specifically. There is no
 * organization-wide reading for a parent, and no way to ask this question in
 * general.
 */
async function scopeOfChild(
  { params }: { params: Params }
): Promise<Scope & { studentUserId: string }> {
  const r = await db
    .prepare(
      `SELECT organization_id FROM guardian_links
        WHERE student_user_id = ? AND revoked_at IS NULL LIMIT 1`
    )
    .get(params.studentId);
  if (!r) throw new NotFound();
  return {
    organizationId: (r as any).organization_id,
    studentUserId: params.studentId,
  };
}

/**
 * What a guardian may read about their child.
 *
 * Work set, work handed in, marks the teacher has released, and attendance.
 * The shape of the digest is the enforcement — it has no field for anything
 * from the personal layer, so nothing built on it can show one by accident.
 *
 * Every read is logged. A parent reading about their child is legitimate and
 * unremarkable; it is also access to a minor's record, and a school that is
 * asked who has been looking should be able to answer.
 */
export const GET = institutionalRoute<Params, Scope & { studentUserId: string }>(
  { permission: "grade:view", scope: scopeOfChild },
  async ({ req, params, userId, scope }) => {
    const url = new URL(req.url);
    const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
    const from =
      url.searchParams.get("from") ??
      new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

    const digest = await digestFor(params.studentId, scope.organizationId!, from, to);

    await audit({
      organizationId: scope.organizationId!,
      actorUserId: userId,
      action: "file:download",
      subjectType: "guardian:read",
      subjectId: params.studentId,
      detail: { from, to },
    });

    return NextResponse.json({ digest });
  }
);
