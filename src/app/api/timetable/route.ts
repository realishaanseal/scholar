import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { db, newId } from "@/lib/db";

export const runtime = "nodejs";

const SELECT = `SELECT id, title, subjectName, dayOfWeek, startHour, startMin, endHour, endMin, location
                  FROM timetable WHERE userId = ? ORDER BY dayOfWeek, startHour, startMin`;

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ classes: await db.prepare(SELECT).all(session.user.id) });
});

const Body = z.object({
  title: z.string().trim().min(1).max(80),
  subjectName: z.string().max(40).nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  startMin: z.number().int().min(0).max(59).optional().default(0),
  endHour: z.number().int().min(0).max(23),
  endMin: z.number().int().min(0).max(59).optional().default(0),
  location: z.string().max(80).nullable().optional(),
});

/** One class, or a batch from the AI import — the single-class shape still
 *  works unchanged, so the manual form needed no edits. */
const PostBody = z.union([Body, z.object({ classes: z.array(Body).min(1).max(200) })]);

function endsBeforeItStarts(b: z.infer<typeof Body>) {
  return b.endHour * 60 + b.endMin <= b.startHour * 60 + b.startMin;
}

async function insertClass(userId: string, b: z.infer<typeof Body>): Promise<string> {
  const id = newId();
  await db.prepare(
    `INSERT INTO timetable (id, userId, title, subjectName, dayOfWeek, startHour, startMin, endHour, endMin, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, userId, b.title, b.subjectName ?? null, b.dayOfWeek,
    b.startHour, b.startMin, b.endHour, b.endMin, b.location ?? null
  );
  return id;
}

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid class." }, { status: 400 });
  }

  // ── Batch ──────────────────────────────────────────────────────────────
  if ("classes" in parsed.data) {
    const rows = parsed.data.classes;
    const bad = rows.findIndex(endsBeforeItStarts);
    if (bad !== -1) {
      return NextResponse.json(
        { error: `"${rows[bad].title}" ends before it starts.` },
        { status: 400 }
      );
    }
    // All-or-nothing: a partial timetable is worse than none, because the
    // student can't tell which half saved without re-reading every row.
    const ids = await db.transaction(async () => {
      const out: string[] = [];
      for (const row of rows) out.push(await insertClass(session.user!.id!, row));
      return out;
    })();

    return NextResponse.json({ ok: true, created: ids.length, ids }, { status: 201 });
  }

  // ── Single ─────────────────────────────────────────────────────────────
  const b = parsed.data;

  // A class that ends before it starts would silently corrupt availability maths.
  if (endsBeforeItStarts(b)) {
    return NextResponse.json({ error: "The end time must be after the start time." }, { status: 400 });
  }

  const id = await insertClass(session.user.id, b);
  return NextResponse.json({ ok: true, id }, { status: 201 });
});

export const DELETE = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const res = await db.prepare(`DELETE FROM timetable WHERE userId = ? AND id = ?`).run(session.user.id, id);
  return NextResponse.json({ ok: res.changes > 0 });
});
