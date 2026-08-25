import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { guarded } from "@/lib/apiAuth";
import { getCommentAttachment } from "@/lib/sharing/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

/** Any member of the group can view a discussion attachment — same rule as
 *  the comment it's on: nothing here is scoped to whoever uploaded it. */
export const GET = jsonRoute(async (_req: Request, ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, attachmentId } = await ctx.params;

  return guarded(async () => {
    const file = await getCommentAttachment(id, session.user!.id!, attachmentId);
    if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const buf = Buffer.from(file.data, "base64");
    return new NextResponse(buf, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      },
    });
  });
});
