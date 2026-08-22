/**
 * Hosted calendar sync — the abstraction, deliberately not yet wired.
 *
 * Google and Microsoft calendar sync both require an OAuth client registered
 * against a real domain with a verified redirect URI, which a local-first build
 * running on localhost cannot complete. Rather than ship buttons that appear to
 * connect and quietly do nothing, the interface each provider will implement is
 * defined here and the UI reports them as pending.
 *
 * The ICS path in ics.ts is the working integration in the meantime: exported
 * files import into all three major calendars, which covers the actual need
 * (getting deadlines into the calendar the student already uses) without an
 * account link.
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
    status: "pending",
    note: "Two-way sync needs a registered Google OAuth client and a public redirect URL, which a local build can't complete. Use the .ics export for now.",
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
