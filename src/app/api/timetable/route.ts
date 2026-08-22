import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { db, newId } from "@/lib/db";

export const runtime = "nodejs";

function timetableCol(userId: string) {
  return db.collection("users").doc(userId).collection("timetable");
}

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await timetableCol(session.user.id)
    .orderBy("dayOfWeek", "asc")
    .orderBy("startHour", "asc")
    .orderBy("startMin", "asc")
    .get();

  const classes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ classes });
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

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid class." }, { status: 400 });
  }
  const b = parsed.data;

  // A class that ends before it starts would silently corrupt availability maths.
  if (b.endHour * 60 + b.endMin <= b.startHour * 60 + b.startMin) {
    return NextResponse.json({ error: "The end time must be after the start time." }, { status: 400 });
  }

  const id = newId();
  await timetableCol(session.user.id).doc(id).set({
    title: b.title,
    subjectName: b.subjectName ?? null,
    dayOfWeek: b.dayOfWeek,
    startHour: b.startHour,
    startMin: b.startMin,
    endHour: b.endHour,
    endMin: b.endMin,
    location: b.location ?? null,
  });

  return NextResponse.json({ ok: true, id }, { status: 201 });
});

export const DELETE = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const ref = timetableCol(session.user.id).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false });

  await ref.delete();
  return NextResponse.json({ ok: true });
});
