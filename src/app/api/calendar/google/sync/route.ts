import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { getConnection, getValidAccessToken } from "@/lib/calendar/googleStore";
import { runSync } from "@/lib/calendar/googleSync";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  // "auto" is the opportunistic sync a dashboard load can trigger — it's
  // rate-limited so navigating around the app doesn't hammer Google's API.
  // "manual" is the explicit Settings "Sync now" button — always honored.
  trigger: z.enum(["auto", "manual"]).optional().default("manual"),
});

const AUTO_SYNC_MIN_INTERVAL_MS = 5 * 60_000;

export const POST = jsonRoute(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const trigger = parsed.success ? parsed.data.trigger : "manual";

  const connection = await getConnection(session.user.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 409 });
  }

  if (trigger === "auto" && connection.lastSyncedAt) {
    const sinceLast = Date.now() - new Date(connection.lastSyncedAt).getTime();
    if (sinceLast < AUTO_SYNC_MIN_INTERVAL_MS) {
      return NextResponse.json({ skipped: true, reason: "synced recently" });
    }
  }

  const accessToken = await getValidAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google Calendar access was lost — reconnect it in Settings." },
      { status: 409 }
    );
  }

  try {
    const result = await runSync(session.user.id, accessToken, connection.calendarId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Sync failed." }, { status: 502 });
  }
});
