import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { ensureCaptureToken, getCaptureStatus, revokeCaptureToken, rotateCaptureToken } from "@/lib/captureToken";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await ensureCaptureToken(session.user.id);
  // ensureCaptureToken may have just created the row (first visit), so read
  // status fresh afterward rather than assuming lastUsedAt is null — a token
  // fetched right after a rotate legitimately has no usage yet either way.
  const { lastUsedAt } = await getCaptureStatus(session.user.id);
  return NextResponse.json({ token, lastUsedAt });
});

/** Rotate. Any extension still holding the old token stops working immediately. */
export const POST = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ token: await rotateCaptureToken(session.user.id), lastUsedAt: null });
});

export const DELETE = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await revokeCaptureToken(session.user.id);
  return NextResponse.json({ ok: true });
});
