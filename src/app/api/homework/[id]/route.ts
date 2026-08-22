import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteHomework, updateHomework, type UpdateHomeworkPatch } from "@/lib/queries";

export const runtime = "nodejs";

const PatchBody = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  details: z.string().max(4000).optional(),
  subject: z.string().max(40).optional(),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  estimateMins: z.number().int().positive().max(1440).nullable().optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  // Focus Mode reports elapsed time; capped at 24h so a tab left open overnight
  // can't poison the historical pace data.
  focusSeconds: z.number().int().min(0).max(86_400).optional(),
  startedAt: z.string().nullable().optional(),
  actualMins: z.number().int().min(0).max(1440).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update" }, { status: 400 });
  }

  const patch: UpdateHomeworkPatch = { ...parsed.data };
  if (patch.dueAt) {
    const d = new Date(patch.dueAt);
    patch.dueAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const updated = await updateHomework(session.user.id, id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await deleteHomework(session.user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
