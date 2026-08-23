import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { guarded } from "@/lib/apiAuth";
import {
  addComment, createGroupTask, deleteGroupTask, getGroupForUser, leaveGroup,
  listComments, listGroupTasks, listMembers, removeMember, rotateJoinCode,
} from "@/lib/sharing/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = jsonRoute(async (_req: Request, ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = session.user.id;

  return guarded(async () => {
    // Membership is checked inside each store call; this only shapes the payload.
    const group = await getGroupForUser(userId, id);
    if (!group) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [tasks, members, comments] = await Promise.all([
      listGroupTasks(id, userId),
      listMembers(id, userId),
      listComments(id, userId, null),
    ]);

    return NextResponse.json({ group, tasks, members, comments });
  });
});

const PostBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("task"),
    title: z.string().trim().min(1).max(160),
    details: z.string().max(4000).optional().default(""),
    subjectName: z.string().max(40).nullable().optional(),
    dueAt: z.string().nullable().optional(),
    estimateMins: z.number().int().positive().max(1440).nullable().optional(),
    assignedTo: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(1).max(2000),
    taskId: z.string().nullable().optional(),
  }),
  z.object({ action: z.literal("rotate-code") }),
]);

export const POST = jsonRoute(async (req: Request, ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = session.user.id;

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  return guarded(async () => {
    switch (parsed.data.action) {
      case "task": {
        const d = parsed.data;
        let dueAt: string | null = null;
        if (d.dueAt) {
          const parsedDate = new Date(d.dueAt);
          if (!Number.isNaN(parsedDate.getTime())) dueAt = parsedDate.toISOString();
        }
        return NextResponse.json(
          {
            task: await createGroupTask(id, userId, {
              title: d.title, details: d.details, subjectName: d.subjectName ?? null,
              dueAt, estimateMins: d.estimateMins ?? null, assignedTo: d.assignedTo ?? null,
            }),
          },
          { status: 201 }
        );
      }
      case "comment":
        return NextResponse.json(
          { comment: await addComment(id, userId, parsed.data.body, parsed.data.taskId ?? null) },
          { status: 201 }
        );
      case "rotate-code":
        return NextResponse.json({ joinCode: await rotateJoinCode(id, userId) });
    }
  });
});

export const DELETE = jsonRoute(async (req: Request, ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = session.user.id;
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  const memberId = url.searchParams.get("memberId");

  return guarded(async () => {
    if (taskId) return NextResponse.json({ ok: await deleteGroupTask(id, userId, taskId) });
    if (memberId) {
      await removeMember(id, userId, memberId);
      return NextResponse.json({ ok: true });
    }
    // No target means "remove me" — which for an owner deletes the group.
    await leaveGroup(id, userId);
    return NextResponse.json({ ok: true, left: true });
  });
});
