import { NextResponse } from "next/server";
import { z } from "zod";
import { institutionalRoute, readBody } from "@/lib/api/guard";
import { Forbidden } from "@/lib/authz";
import {
  administeredOrganizations, getOrganizationTime, setOrganizationTime,
} from "@/domains/identity";
import { audit } from "@/lib/governance";
import type { Scope } from "@/lib/authz";

export const runtime = "nodejs";

type Params = Record<string, never>;

const timeSchema = z.object({
  timezone: z.string().trim().min(1).max(64),
  restDays: z.array(z.number().int().min(0).max(6)).max(7),
  gradingScheme: z.string().trim().max(32).optional(),
  aiPolicy: z.enum(["off", "institution", "teacher"]).optional(),
});

/**
 * The institution this administrator runs.
 *
 * Deliberately not identified in the URL. An organization id in a path is a
 * tenant a caller gets to name, and the guard exists to stop that; here the
 * subject is "the institution you administer", which the session already
 * knows. Resolving it from the actor rather than the request means there is
 * no id to point somewhere else.
 */
async function scopeOfAdministeredOrg({ userId }: { userId: string }): Promise<Scope> {
  const orgs = await administeredOrganizations(userId);
  const org = orgs[0];
  if (!org) throw new Forbidden("organization:manage", {}, "administers no organization");
  return { organizationId: org.id };
}

/**
 * The institution's clock and working week.
 *
 * Neither is a display preference. The zone decides what every deadline in
 * the institution means; the rest days decide which days Scholar tells
 * students they are free to work.
 */
export const GET = institutionalRoute<Params, Scope>(
  { permission: "organization:manage", scope: scopeOfAdministeredOrg },
  async ({ scope }) =>
    NextResponse.json(await getOrganizationTime(scope.organizationId!))
);

export const PUT = institutionalRoute<Params, Scope>(
  { permission: "organization:manage", scope: scopeOfAdministeredOrg },
  async ({ req, userId, scope }) => {
    const input = await readBody(req, timeSchema);
    const organizationId = scope.organizationId!;
    const saved = await setOrganizationTime(organizationId, input);

    await audit({
      organizationId,
      actorUserId: userId,
      action: "member:add",
      subjectType: "organization:time",
      subjectId: organizationId,
      detail: {
        timezone: saved.timezone,
        restDays: saved.restDays.join(","),
        gradingScheme: saved.gradingScheme,
        aiPolicy: saved.aiPolicy,
      },
    });

    return NextResponse.json(saved);
  }
);
