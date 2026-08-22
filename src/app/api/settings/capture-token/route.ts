import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { ensureCaptureToken, revokeCaptureToken, rotateCaptureToken } from "@/lib/captureToken";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ token: await ensureCaptureToken(session.user.id) });
});

/** Rotate. Any extension still holding the old token stops working immediately. */
export const POST = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ token: await rotateCaptureToken(session.user.id) });
});

export const DELETE = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await revokeCaptureToken(session.user.id);
  return NextResponse.json({ ok: true });
});
