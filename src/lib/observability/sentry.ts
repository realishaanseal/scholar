import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { scrubObject, scrubText, scrubUrl } from "./scrub";

/**
 * Shared Sentry options for every runtime.
 *
 * Sentry is inert without a DSN, which is deliberate: the same build runs in
 * development and in preview without reporting anything, and turning it on is
 * a matter of setting one environment variable rather than changing code.
 */

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/**
 * Errors that are noise rather than signal.
 *
 * A user navigating away mid-request, an extension injecting a script, a
 * network blip on a phone — none of these are bugs, and a reporter full of
 * them is a reporter nobody reads.
 */
const IGNORED = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "AbortError",
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
  "cancelled",
];

export const sentryBaseOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  /**
   * Never attach IP addresses, cookies or headers automatically. Scholar's
   * users include minors, and the default here is the wrong one for us.
   */
  sendDefaultPii: false,

  /**
   * Sample rather than send everything. Errors are always sent; traces are
   * expensive and 10% is plenty to see a slow endpoint.
   */
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

  ignoreErrors: IGNORED,

  /**
   * The last gate before anything leaves the process.
   *
   * Runs on every event regardless of which integration produced it, so a
   * future integration that starts attaching request bodies is caught here
   * rather than discovered in the Sentry UI.
   */
  beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
    if (!SENTRY_ENABLED) return null;

    // Identify the user by id only. No email, no name, no IP.
    if (event.user) {
      event.user = { id: event.user.id };
    }

    if (event.request) {
      if (event.request.url) event.request.url = scrubUrl(event.request.url);
      delete event.request.cookies;
      delete event.request.data;
      event.request.headers = event.request.headers
        ? (scrubObject(event.request.headers) as Record<string, string>)
        : undefined;
      delete event.request.query_string;
    }

    if (event.extra) event.extra = scrubObject(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts;

    // Messages and exception values are free text, and free text is where
    // connection strings and tokens end up.
    if (event.message) event.message = scrubText(event.message);
    for (const ex of event.exception?.values ?? []) {
      if (ex.value) ex.value = scrubText(ex.value);
    }
    for (const b of event.breadcrumbs ?? []) {
      if (b.message) b.message = scrubText(b.message);
      if (b.data) b.data = scrubObject(b.data) as Record<string, unknown>;
    }

    return event;
  },
};
