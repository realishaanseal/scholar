import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { listRoster } from "@/domains/courses";
import { scopeOfSection, type ResourceScope } from "@/domains/assessment";

export const runtime = "nodejs";

type Params = { sectionId: string };

/**
 * Who is in this section.
 *
 * student:view is organization-scoped rather than course-bound, which on its
 * own would let any teacher list any student in the institution. The policy
 * engine closes that by refusing a teacher scope that names a student without
 * naming where; here the section is named, so the binding check applies and a
 * teacher sees only their own rooms.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  {
    permission: "student:view",
    scope: async ({ params }) => {
      const scope = await scopeOfSection(params.sectionId);
      if (!scope) throw new NotFound();
      return scope;
    },
  },
  async ({ params }) => {
    const roster = await listRoster(params.sectionId);
    return NextResponse.json({ roster });
  }
);
