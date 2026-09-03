import { NextResponse } from "next/server";
import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { scopeOfSection, type ResourceScope } from "@/domains/assessment";
import { checkDeadline } from "@/domains/insight";

export const runtime = "nodejs";

type Params = { sectionId: string };

async function sectionScope({ params }: { params: Params }) {
  const scope = await scopeOfSection(params.sectionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * Is this class already busy on the day a teacher is about to pick?
 *
 * The one thing an LMS structurally cannot tell a teacher without asking: they
 * can see their own assignments and have no idea the same class has two other
 * things due that Thursday. The student feels the collision, and nobody who
 * caused it ever sees it.
 *
 * A GET, and advisory. It returns a sentence and no verdict — nothing here can
 * refuse a deadline, because a teacher may have an excellent reason for a
 * crowded week and a system that overruled them on a heuristic would be wrong
 * more often than right, and resented in exactly the cases where it was
 * correct.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "assignment:create", scope: sectionScope },
  async ({ req, params }) => {
    const url = new URL(req.url);
    const day = url.searchParams.get("day");
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json({ warning: null });
    }

    const minsRaw = url.searchParams.get("mins");
    const mins = minsRaw && Number.isFinite(Number(minsRaw)) ? Number(minsRaw) : null;

    // Excluded so editing an existing assignment does not warn about itself.
    const exclude = url.searchParams.get("exclude");

    return NextResponse.json({
      warning: await checkDeadline(params.sectionId, day, mins, exclude),
    });
  }
);
