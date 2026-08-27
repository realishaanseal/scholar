import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { exchangeCode } from "@/lib/calendar/google";
import { saveConnection } from "@/lib/calendar/googleStore";

export const runtime = "nodejs";

/** Where the student lands after connecting (or failing to) — the Calendar
 *  page reads `?calendar=` to show a one-time result banner. */
function settingsRedirect(req: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/calendar", req.url);
  url.searchParams.set("calendar", status);
  if (message) url.searchParams.set("calendarError", message.slice(0, 200));
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("vxs_gcal_state")?.value;
  cookieStore.delete("vxs_gcal_state");

  if (oauthError) {
    return settingsRedirect(
      req,
      "error",
      oauthError === "access_denied" ? "You didn't grant calendar access." : oauthError
    );
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect(req, "error", "That connection attempt couldn't be verified — try again.");
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refreshToken) {
      // Happens if Google skips the consent screen (e.g. re-connecting
      // without `prompt=consent` actually taking effect) — without a refresh
      // token the connection dies the moment the access token expires.
      return settingsRedirect(
        req,
        "error",
        "Google didn't return a long-lived connection — disconnect any prior access at myaccount.google.com/permissions and try again."
      );
    }
    await saveConnection(session.user.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
  } catch (err: any) {
    return settingsRedirect(req, "error", err?.message ?? "Couldn't complete the connection.");
  }

  return settingsRedirect(req, "connected");
}
