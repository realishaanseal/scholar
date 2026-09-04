import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, readBody } from "@/lib/api/guard";
import {
  addMember, administeredOrganizations, invite, pendingInvitations,
  revokeInvitation,
} from "@/domains/identity";
import { findUserByEmail } from "@/lib/queries";
import { audit } from "@/lib/governance";
import { Forbidden } from "@/lib/authz";
import type { Scope } from "@/lib/authz";

export const runtime = "nodejs";

type Params = Record<string, never>;

async function scopeOfAdministeredOrg({ userId }: { userId: string }): Promise<Scope> {
  const org = (await administeredOrganizations(userId))[0];
  if (!org) throw new Forbidden("organization:manage", {}, "administers no organization");
  return { organizationId: org.id };
}

const ROLES = [
  "STUDENT", "TEACHER", "TEACHING_ASSISTANT",
  "DEPARTMENT_ADMIN", "INSTITUTION_ADMIN",
] as const;

const inviteSchema = z.object({
  // Several at once, because inviting a class one address at a time is how an
  // administrator decides the software is not worth the trouble.
  emails: z.string().trim().min(3).max(20_000),
  role: z.enum(ROLES),
  courseSectionId: z.string().trim().max(64).nullable().default(null),
});

/** Everyone invited and not yet arrived. */
export const GET = institutionalRoute<Params, Scope>(
  { permission: "member:manage", scope: scopeOfAdministeredOrg },
  async ({ scope }) =>
    NextResponse.json({ invitations: await pendingInvitations(scope.organizationId!) })
);

/**
 * Invite people, by address.
 *
 * Somebody who already has an account is added straight away; somebody who
 * does not gets an invitation that applies itself when they sign up. The
 * caller is told which happened for each address, because "added" and "will
 * be added when they register" are different things for an administrator
 * wondering why a roster looks short.
 *
 * Addresses are split on anything a person plausibly separates them with —
 * commas, semicolons, newlines, spaces — because the realistic input here is
 * a column pasted out of a spreadsheet.
 */
export const POST = institutionalRoute<Params, Scope>(
  { permission: "member:manage", scope: scopeOfAdministeredOrg },
  async ({ req, userId, scope }) => {
    const input = await readBody(req, inviteSchema);
    const organizationId = scope.organizationId!;

    const addresses = [
      ...new Set(
        input.emails
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@") && e.length <= 200)
      ),
    ].slice(0, 500);

    const added: string[] = [];
    const invited: string[] = [];

    for (const email of addresses) {
      const existing = await findUserByEmail(email);
      if (existing) {
        await addMember(organizationId, {
          userId: existing.id,
          role: input.role,
          departmentId: null,
        });
        added.push(email);
      } else {
        await invite({
          organizationId,
          email,
          role: input.role,
          courseSectionId: input.courseSectionId,
          invitedBy: userId,
        });
        invited.push(email);
      }
    }

    await audit({
      organizationId,
      actorUserId: userId,
      action: "member:add",
      subjectType: "invitation",
      detail: { role: input.role, added: added.length, invited: invited.length },
    });

    return NextResponse.json({ added, invited }, { status: 201 });
  }
);

const revokeSchema = z.object({ invitationId: z.string().trim().min(1).max(64) });

export const DELETE = institutionalRoute<Params, Scope>(
  { permission: "member:manage", scope: scopeOfAdministeredOrg },
  async ({ req, scope }) => {
    const { invitationId } = await readBody(req, revokeSchema);
    await revokeInvitation(scope.organizationId!, invitationId);
    return NextResponse.json({ ok: true });
  }
);
