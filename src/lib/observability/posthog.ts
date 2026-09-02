/**
 * Product analytics, configured for an application used by minors.
 *
 * The defaults of every analytics library are built for e-commerce, where
 * capturing everything a visitor does is the point. Scholar's users are
 * students, often children, and the DOM they interact with is their own
 * homework. So each of these is turned off deliberately rather than left at
 * its default, and the reasoning is recorded next to it.
 */

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/** Inert without a key, exactly like Sentry. */
export const POSTHOG_ENABLED = POSTHOG_KEY.length > 0;

export const posthogOptions = {
  api_host: POSTHOG_HOST,

  /**
   * Off. Autocapture records the text of every element clicked, which here
   * means assignment titles, subject names and task content.
   */
  autocapture: false,

  /**
   * Off. Session replay records the DOM — a student's work, in full, played
   * back later. There is no masking configuration that makes that acceptable
   * for this audience.
   */
  disable_session_recording: true,

  /**
   * Paths only. A query string carries ids and search terms, and a URL is the
   * easiest place to leak them without noticing.
   */
  capture_pageview: false,
  capture_pageleave: true,

  /** No IP-based geolocation, and no cross-site identity. */
  ip: false,
  cross_subdomain_cookie: false,
  persistence: "localStorage" as const,

  /**
   * Honour Do Not Track. Widely ignored by the industry; the people who set it
   * meant it.
   */
  respect_dnt: true,

  /**
   * Opt in, not opt out. Nothing is sent until the person has agreed, which is
   * the only defensible default when some of them cannot legally consent for
   * themselves.
   */
  opt_out_capturing_by_default: true,

  mask_all_text: true,
  mask_all_element_attributes: true,
};

/**
 * The only events worth sending.
 *
 * An allowlist rather than a blocklist: a new event has to be added here on
 * purpose, so nobody ships one that happens to carry a task title in a
 * property. Names describe what a person did, never what they wrote.
 */
export const ALLOWED_EVENTS = [
  "task_created",
  "task_completed",
  "focus_session_started",
  "focus_session_completed",
  "plan_generated",
  "plan_accepted",
  "timetable_imported",
  "signed_up",
  "signed_in",
] as const;

export type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

/**
 * Property values are counts, durations and enums — never free text.
 *
 * Typed narrowly so that passing a task title is a compile error rather than
 * a privacy incident discovered in a dashboard.
 */
export type EventProperties = Record<string, number | boolean | null>;
