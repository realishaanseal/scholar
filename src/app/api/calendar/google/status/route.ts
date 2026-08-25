import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonRoute } from "@/lib/apiRoute";
import { isGoogleCalendarConfigured, redirectUri } from "@/lib/calendar/google";
import { getConnection } from "@/lib/calendar/googleStore";

export const runtime = "nodejs";

export const GET = jsonRoute(async () => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connection = await getConnection(session.user.id);

  // Surfaced so a "redirect_uri_mismatch" from Google can be fixed by copying
  // this exact string into the Cloud Console rather than guessing at it — it's
  // a public callback URL, not a secret, so there's nothing sensitive in
  // returning it. Missing AUTH_URL is the most common cause of the mismatch
  // in the first place, so this can't throw the whole route with it.
  let expectedRedirectUri: string | null = null;
  let redirectUriError: string | null = null;
  if (isGoogleCalendarConfigured()) {
    try {
      expectedRedirectUri = redirectUri();
    } catch (err: any) {
      redirectUriError = err?.message ?? "AUTH_URL isn't set.";
    }
  }

  return NextResponse.json({
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(connection),
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
    expectedRedirectUri,
    redirectUriError,
  });
});
