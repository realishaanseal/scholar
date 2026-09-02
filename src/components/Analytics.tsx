"use client";

import { usePathname } from "next/navigation";
import type { PostHog } from "posthog-js";
import { useEffect } from "react";
import {
  ALLOWED_EVENTS, POSTHOG_ENABLED, POSTHOG_KEY, posthogOptions,
  type AllowedEvent, type EventProperties,
} from "@/lib/observability/posthog";

/**
 * Analytics, mounted but silent until someone opts in.
 *
 * posthog-js is imported dynamically rather than at the top of the module.
 * Capturing is opted out by default and the library is inert without a key, so
 * a static import would put roughly sixty kilobytes of analytics into the
 * first load of every page in order to do nothing. The type import above is
 * erased at build time and costs nothing.
 */

let client: PostHog | null = null;

async function load(): Promise<PostHog | null> {
  if (!POSTHOG_ENABLED) return null;
  if (client) return client;
  const mod = await import("posthog-js");
  mod.default.init(POSTHOG_KEY, posthogOptions);
  client = mod.default;
  return client;
}

export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!POSTHOG_ENABLED) return;
    let cancelled = false;

    void load().then((ph) => {
      if (cancelled || !ph || ph.has_opted_out_capturing()) return;
      // The path alone. capture_pageview is off in the options precisely so
      // this can send a URL with the query string already gone.
      ph.capture("$pageview", { $current_url: pathname });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

/**
 * Record an event.
 *
 * The signature is the guard: only allowlisted names, and properties that can
 * only be numbers, booleans or null. A task title is not assignable to that,
 * so leaking one is a type error rather than a discovery made later in a
 * dashboard.
 *
 * Fire-and-forget. An analytics call must never make a user wait, and must
 * never be the reason an interaction throws.
 */
export function track(event: AllowedEvent, properties: EventProperties = {}) {
  if (!POSTHOG_ENABLED || !ALLOWED_EVENTS.includes(event)) return;
  void load()
    .then((ph) => {
      if (ph && !ph.has_opted_out_capturing()) ph.capture(event, properties);
    })
    .catch(() => {});
}

/** Consent controls, for a settings toggle to call. */
export const analyticsConsent = {
  async grant() {
    (await load())?.opt_in_capturing();
  },
  async revoke() {
    (await load())?.opt_out_capturing();
  },
  granted() {
    return Boolean(client && !client.has_opted_out_capturing());
  },
};
