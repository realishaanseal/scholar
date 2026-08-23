import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { disconnect } from "@/lib/calendar/googleStore";

export const runtime = "nodejs";

export const POST = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await disconnect(session.user.id);
  return NextResponse.json({ ok: true });
});
