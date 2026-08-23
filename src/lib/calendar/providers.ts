/**
 * Hosted calendar sync.
 *
 * Google is wired (see google.ts / googleStore.ts / googleSync.ts) — it
 * reuses the same OAuth client as sign-in with the calendar scope and a
 * second redirect URI, which only works once the app has a real deployed
 * origin (`AUTH_URL` pointing at something other than localhost). Microsoft
 * calendar sync would need its own registered application and isn't built
 * yet; the interface below is what it would implement.
 *
 * The ICS path in ics.ts remains the zero-setup fallback: exported files
 * import into all three major calendars with no account link at all, for a
 * student who'd rather not connect an account, or whose deployment doesn't
 * have Google Calendar configured.
 */

import type { CalendarEvent } from "./ics";

export type CalendarProviderId = "google" | "outlook" | "ics";

export type CalendarProviderInfo = {
  id: CalendarProviderId;
  label: string;
  /** Whether this provider can actually be used right now. */
  status: "available" | "pending";
  /** Shown in the UI. For pending providers, states what is missing. */
  note: string;
  /** Whether writing events back to the provider is supported. */
  canWrite: boolean;
};

export const CALENDAR_PROVIDERS: CalendarProviderInfo[] = [
  {
    id: "ics",
    label: "Calendar file (.ics)",
    status: "available",
    note: "Download your deadlines and import them into Google Calendar, Outlook or Apple Calendar. Works everywhere, no account needed.",
    canWrite: false,
  },
  {
    id: "google",
    label: "Google Calendar",
    status: "available",
    note: "Two-way sync: assignments you add here appear on your Google Calendar, and edits or deletions you make to those specific events sync back. Scholar won't import unrelated events from your calendar as homework.",
    canWrite: true,
  },
  {
    id: "outlook",
    label: "Outlook Calendar",
    status: "pending",
    note: "Two-way sync needs a registered Microsoft application. Use the .ics export for now.",
    canWrite: true,
  },
];

/**
 * Contract a hosted provider must satisfy. Writing this down now keeps the
 * eventual OAuth implementations from reshaping everything that calls them.
 */
export interface CalendarSync {
  readonly id: CalendarProviderId;
  /** Events already in the student's calendar, used to spot conflicts. */
  listBusy(from: Date, to: Date): Promise<Array<{ start: Date; end: Date; title: string }>>;
  /**
   * Push Scholar's deadlines into the calendar. Implementations must never
   * modify or delete an event they did not create — the student's existing
   * calendar is not Scholar's to rewrite.
   */
  pushEvents(events: CalendarEvent[]): Promise<{ created: number; updated: number }>;
}

export function providerInfo(id: CalendarProviderId): CalendarProviderInfo | undefined {
  return CALENDAR_PROVIDERS.find((p) => p.id === id);
}

export function isAvailable(id: CalendarProviderId): boolean {
  return providerInfo(id)?.status === "available";
}
