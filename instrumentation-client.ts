/**
 * Browser instrumentation.
 *
 * The import is dynamic and the guard reads process.env directly rather than
 * through a helper. Next inlines NEXT_PUBLIC_* as literals at build time, so
 * webpack can see this branch is dead when no DSN is configured and drop the
 * SDK entirely — a static import cost 408 kB in the initial bundle to run a
 * client that had been told to do nothing. Reading through a re-exported
 * constant defeats that folding, which is why this one place is deliberately
 * less tidy than the rest.
 *
 * Session Replay is not enabled here and should not be. It records the DOM,
 * and this application's DOM is a student's homework, their notes and their
 * conversations with an AI. Watching that back is not debugging, and no
 * masking configuration makes it appropriate for an audience of minors.
 */
type TransitionCapture = (href: string, navigationType: string) => void;

let captureTransition: TransitionCapture | undefined;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void (async () => {
    const [Sentry, { sentryBaseOptions }] = await Promise.all([
      import("@sentry/nextjs"),
      import("@/lib/observability/sentry"),
    ]);
    Sentry.init({ ...sentryBaseOptions, integrations: [] });
    captureTransition = Sentry.captureRouterTransitionStart;
  })();
}

/**
 * Always exported, so Next always finds the hook it looks for. It is a no-op
 * until the SDK has loaded, and permanently a no-op when there is no DSN.
 */
export function onRouterTransitionStart(href: string, navigationType: string) {
  captureTransition?.(href, navigationType);
}
