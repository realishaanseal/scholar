/**
 * Google Calendar API — OAuth token exchange/refresh and the handful of
 * REST calls the sync needs. Plain `fetch` against Google's HTTP API rather
 * than the `googleapis` SDK: the codebase already talks to every AI provider
 * this way (see `ai/providers.ts`), and the surface area actually needed here
 * (list/insert/update/delete on one calendar, plus a token refresh) is small
 * enough that a full SDK dependency isn't worth its weight.
 *
 * Reuses the same OAuth client as sign-in (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`)
 * with a second, separate redirect URI (`/api/calendar/google/callback`) and
 * the calendar scope added — see SETUP.md for the Google Cloud Console step
 * this requires (adding that redirect URI to the existing OAuth client).
 */

import { fetchWithTimeout, safeJson } from "../http";

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/calendar/v3";

/** Read-only access to free/busy plus full read/write on events — nothing
 *  broader (no calendar list management, no settings). */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

function credentials() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar isn't configured — AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are missing.");
  }
  return { clientId, clientSecret };
}

/** The callback URL Google redirects back to — must exactly match what's
 *  registered in the Google Cloud Console OAuth client. */
export function redirectUri(): string {
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("AUTH_URL must be set to connect Google Calendar.");
  return `${base}/api/calendar/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    // Forces Google to hand back a refresh token even if this user already
    // granted this app access before (Google only issues one on first
    // consent otherwise, which breaks a reconnect-after-disconnect).
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
};

export async function exchangeCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
    timeoutMs: 15_000,
  });

  const body = await safeJson<any>(res);
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.error_description ?? "Google rejected that authorization code.");
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
    scope: body.scope ?? CALENDAR_SCOPE,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = credentials();
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    timeoutMs: 15_000,
  });

  const body = await safeJson<any>(res);
  if (!res.ok || !body?.access_token) {
    throw new Error(
      body?.error === "invalid_grant"
        ? "Google Calendar access was revoked — reconnect it in Settings."
        : body?.error_description ?? "Couldn't refresh the Google Calendar connection."
    );
  }

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export type GoogleEvent = {
  id: string;
  status?: string; // "confirmed" | "cancelled" | ...
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  updated?: string;
  extendedProperties?: { private?: Record<string, string> };
};

/**
 * Incremental list via syncToken when we have one; a full window otherwise.
 * A 410 means the syncToken expired/was invalidated — the caller must drop it
 * and do a fresh full-window pull.
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string | null; timeMin?: string; timeMax?: string }
): Promise<{ events: GoogleEvent[]; nextSyncToken: string | null; syncTokenExpired: boolean }> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
    if (opts.syncToken) params.set("syncToken", opts.syncToken);
    else {
      if (opts.timeMin) params.set("timeMin", opts.timeMin);
      if (opts.timeMax) params.set("timeMax", opts.timeMax);
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetchWithTimeout(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 20_000 }
    );

    if (res.status === 410) return { events: [], nextSyncToken: null, syncTokenExpired: true };

    const body = await safeJson<any>(res);
    if (!res.ok) throw new Error(body?.error?.message ?? `Google Calendar returned ${res.status}.`);

    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (body.nextSyncToken) nextSyncToken = body.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken, syncTokenExpired: false };
}

export type EventInput = {
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  /** Tags this event as Scholar's, so it's identifiable even without our DB
   *  (e.g. if the student inspects it in Google Calendar directly). */
  extendedProperties?: { private?: Record<string, string> };
};

export async function insertEvent(accessToken: string, calendarId: string, event: EventInput): Promise<GoogleEvent> {
  const res = await fetchWithTimeout(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
    timeoutMs: 15_000,
  });
  const body = await safeJson<any>(res);
  if (!res.ok) throw new Error(body?.error?.message ?? `Couldn't create that event (${res.status}).`);
  return body;
}

export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: EventInput
): Promise<GoogleEvent> {
  const res = await fetchWithTimeout(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
      timeoutMs: 15_000,
    }
  );
  const body = await safeJson<any>(res);
  if (!res.ok) throw new Error(body?.error?.message ?? `Couldn't update that event (${res.status}).`);
  return body;
}

/**
 * Revoke a token at Google's end (https://oauth2.googleapis.com/revoke). Call
 * this on disconnect, not just delete the row locally — otherwise the grant
 * stays live in the student's Google Account long after Scholar "forgot" it,
 * which is surprising and leaves an access grant nobody's tracking anymore.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetchWithTimeout("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      timeoutMs: 10_000,
    });
  } catch {
    // Best-effort: Google being unreachable shouldn't block disconnecting
    // locally — the student can also revoke it directly at
    // myaccount.google.com/permissions if this silently fails.
  }
}

/** 404/410 both mean "already gone on Google's side" — treated as success by
 *  the caller, not an error, since the desired end state is already true. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 15_000 }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410 && res.status !== 204) {
    const body = await safeJson<any>(res);
    throw new Error(body?.error?.message ?? `Couldn't delete that event (${res.status}).`);
  }
}
