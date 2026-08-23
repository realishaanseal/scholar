import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { isGoogleCalendarConfigured } from "@/lib/calendar/google";
import { getConnection } from "@/lib/calendar/googleStore";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getConnection(session.user.id);
  return NextResponse.json({
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(connection),
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
  });
});
