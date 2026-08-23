import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { guarded } from "@/lib/apiAuth";
import { listGrantsReceived } from "@/lib/sharing/store";
import { subjectDisplayName, viewsForGrant } from "@/lib/sharing/views";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read the data one grant exposes.
 *
 * The scopes are taken from the stored grant, never from the request — a
 * client asking for a scope it wasn't given gets nothing, because the question
 * is never asked on its behalf.
 */
export const GET = jsonRoute(async (_req: Request, ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = session.user.id;

  return guarded(async () => {
    const grant = (await listGrantsReceived(userId)).find((g) => g.id === id);
    // Same response whether it doesn't exist or isn't theirs — otherwise the
    // 404/403 split would confirm which grant ids are real.
    if (!grant) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({
      grant: { ...grant, subjectName: await subjectDisplayName(grant.subjectUserId) },
      views: await viewsForGrant(userId, grant.id, grant.scopes),
    });
  });
});
