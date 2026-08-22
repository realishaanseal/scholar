import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createHomework, linkAttachments, listHomework, listSubjects } from "@/lib/queries";

export const runtime = "nodejs";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(160),
  details: z.string().max(4000).optional().default(""),
  subject: z.string().max(40).optional().default("General"),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  estimateMins: z.number().int().positive().max(1440).nullable().optional(),
  rawInput: z.string().max(4000).optional().default(""),
  source: z.enum(["text", "voice"]).optional().default("text"),
  aiConfidence: z.number().min(0).max(1).nullable().optional(),
  aiNotes: z.string().max(1000).optional().default(""),
  attachmentIds: z.array(z.string()).max(20).optional().default([]),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [homework, subjects] = await Promise.all([
    listHomework(session.user.id),
    listSubjects(session.user.id),
  ]);
  return NextResponse.json({ homework, subjects });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const b = parsed.data;

  let dueAt: string | null = null;
  if (b.dueAt) {
    const d = new Date(b.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d.toISOString();
  }

  const created = await createHomework({
    userId: session.user.id,
    title: b.title,
    details: b.details ?? "",
    subject: b.subject ?? "General",
    dueAt,
    priority: b.priority ?? "normal",
    estimateMins: b.estimateMins ?? null,
    rawInput: b.rawInput ?? "",
    source: b.source ?? "text",
    aiConfidence: b.aiConfidence ?? null,
    aiNotes: b.aiNotes ?? "",
  });

  if (b.attachmentIds?.length) await linkAttachments(session.user.id, created.id, b.attachmentIds);

  return NextResponse.json(created, { status: 201 });
}
