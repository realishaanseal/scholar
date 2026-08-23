import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { guarded } from "@/lib/apiAuth";
import { createGroup, joinGroupByCode, listGroups } from "@/lib/sharing/store";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ groups: await listGroups(session.user.id) });
});

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["study-group", "course"]).optional().default("study-group"),
    subjectName: z.string().max(40).nullable().optional(),
  }),
  z.object({
    action: z.literal("join"),
    code: z.string().trim().min(4).max(16),
  }),
]);

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const userId = session.user.id;

  return guarded(async () => {
    const group =
      parsed.data.action === "create"
        ? await createGroup(userId, {
            name: parsed.data.name,
            kind: parsed.data.kind,
            subjectName: parsed.data.subjectName ?? null,
          })
        : await joinGroupByCode(userId, parsed.data.code);

    return NextResponse.json({ group }, { status: 201 });
  });
});
