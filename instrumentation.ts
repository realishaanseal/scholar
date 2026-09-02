/**
 * Server and edge instrumentation.
 *
 * Next calls register() once per runtime before any request is handled, which
 * is the only point early enough to catch a failure during module
 * initialisation — a bad DATABASE_URL, for instance.
 *
 * Dynamic for the same reason as the client hook: with no DSN configured the
 * SDK should not be pulled into the server bundle at all, where it would be
 * paid for on every cold start.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME !== "nodejs" && process.env.NEXT_RUNTIME !== "edge") return;

  const [Sentry, { sentryBaseOptions }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/observability/sentry"),
  ]);
  Sentry.init(sentryBaseOptions);
}

/**
 * Errors thrown inside Server Components and route handlers do not pass
 * through register(); Next hands them here instead.
 */
export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
