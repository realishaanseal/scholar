import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { buildAuthUrl, isGoogleCalendarConfigured } from "@/lib/calendar/google";

export const runtime = "nodejs";

/** How long the CSRF state cookie is trusted for — long enough for a slow
 *  consent screen, short enough that a stale cookie can't be replayed later. */
const STATE_MAX_AGE_S = 600;

/**
 * Kicks off the Google Calendar OAuth flow. A GET (not POST) because this is
 * meant to be a plain link/redirect target, matching how NextAuth's own
 * sign-in works — the user is taken to Google, not asked to submit a form.
 */
export async function GET() {
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar isn't configured on this deployment." },
      { status: 501 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("vxs_gcal_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_MAX_AGE_S,
    path: "/",
  });

  let authUrl: string;
  try {
    authUrl = buildAuthUrl(state);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Couldn't start the Google Calendar connection." }, { status: 500 });
  }

  return NextResponse.redirect(authUrl);
}
