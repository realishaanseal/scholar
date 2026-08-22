import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { createHomework } from "@/lib/queries";

export const runtime = "nodejs";

const Item = z.object({
  title: z.string().trim().min(1).max(160),
  details: z.string().max(4000).optional().default(""),
  subject: z.string().max(40).optional().default("General"),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  estimateMins: z.number().int().positive().max(1440).nullable().optional(),
});

const Body = z.object({
  // Bounded so an approved plan can't create an unbounded number of rows.
  items: z.array(Item).min(1).max(60),
  source: z.enum(["plan", "import"]).optional().default("plan"),
});

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plan." },
      { status: 400 }
    );
  }

  const created = [];
  for (const item of parsed.data.items) {
    let dueAt: string | null = null;
    if (item.dueAt) {
      const d = new Date(item.dueAt);
      if (!Number.isNaN(d.getTime())) dueAt = d.toISOString();
    }

    created.push(
      await createHomework({
        userId: session.user.id,
        title: item.title,
        details: item.details ?? "",
        subject: item.subject ?? "General",
        dueAt,
        priority: item.priority ?? "normal",
        estimateMins: item.estimateMins ?? null,
        rawInput: "",
        source: "text",
        aiConfidence: null,
        aiNotes: parsed.data.source === "plan" ? "Generated from a syllabus study plan." : "",
      })
    );
  }

  return NextResponse.json({ created: created.length, homework: created }, { status: 201 });
});
