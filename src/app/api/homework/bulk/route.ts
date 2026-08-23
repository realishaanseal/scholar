import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { createHomework, upsertExternalHomework } from "@/lib/queries";

export const runtime = "nodejs";

const Item = z.object({
  title: z.string().trim().min(1).max(160),
  details: z.string().max(4000).optional().default(""),
  subject: z.string().max(40).optional().default("General"),
  dueAt: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  estimateMins: z.number().int().positive().max(1440).nullable().optional(),
  /** Present when this item came from an external sync (LMS ICS import,
   *  Google Calendar) — lets a resync update the matching row instead of
   *  creating a near-duplicate. Requires `externalSource` on the request body. */
  externalId: z.string().max(300).optional(),
});

const Body = z.object({
  // Bounded so an approved plan can't create an unbounded number of rows.
  items: z.array(Item).min(1).max(60),
  source: z.enum(["plan", "import"]).optional().default("plan"),
  /** Identity of the external system every item's `externalId` belongs to
   *  (e.g. "lms", "google-calendar"). One value for the whole batch — a
   *  single import always comes from one source. */
  externalSource: z.string().max(40).optional(),
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
  let updatedCount = 0;

  for (const item of parsed.data.items) {
    let dueAt: string | null = null;
    if (item.dueAt) {
      const d = new Date(item.dueAt);
      if (!Number.isNaN(d.getTime())) dueAt = d.toISOString();
    }

    if (item.externalId && parsed.data.externalSource) {
      const { homework, created: isNew } = await upsertExternalHomework({
        userId: session.user.id,
        externalSource: parsed.data.externalSource,
        externalId: item.externalId,
        title: item.title,
        details: item.details ?? "",
        subject: item.subject ?? "General",
        dueAt,
        priority: item.priority ?? "normal",
        estimateMins: item.estimateMins ?? null,
      });
      created.push(homework);
      if (!isNew) updatedCount++;
      continue;
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

  return NextResponse.json(
    { created: created.length - updatedCount, updated: updatedCount, homework: created },
    { status: 201 }
  );
});
