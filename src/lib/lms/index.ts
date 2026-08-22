import { parseICS, type ImportedEvent } from "../calendar/ics";

/**
 * Importing assignments from a learning-management system.
 *
 * The obvious route is each vendor's REST API, but every one of them needs
 * either an OAuth client registered against a public domain (Google Classroom)
 * or a personal access token the student has to generate and paste (Canvas,
 * Moodle). None of that can be completed — let alone verified — from a local
 * build, and an integration that has never touched a live instance is not one
 * worth shipping as though it works.
 *
 * What every one of these platforms *does* expose is a personal iCalendar feed
 * URL, designed exactly for this. It needs no OAuth, no token and no app
 * registration, it is per-student and read-only, and it carries the assignment
 * titles and due dates — which is the whole point of the import. So that is the
 * path that is actually built here.
 */

export type LmsId = "canvas" | "moodle" | "blackboard" | "classroom" | "teams" | "other";

export type LmsInfo = {
  id: LmsId;
  label: string;
  /** Where the student finds their personal calendar feed URL. */
  instructions: string;
  /** Recognises a feed URL as belonging to this platform. */
  match?: RegExp;
};

export const LMS_PLATFORMS: LmsInfo[] = [
  {
    id: "canvas",
    label: "Canvas",
    instructions:
      "In Canvas open Calendar, click “Calendar Feed” in the right sidebar, and copy the link.",
    match: /instructure\.com|\/feeds\/calendars\//i,
  },
  {
    id: "moodle",
    label: "Moodle",
    instructions:
      "In Moodle open Calendar, click “Export calendar”, choose “All events” and “This month/Recent and next 60 days”, then click “Get calendar URL”.",
    match: /\/calendar\/export_execute\.php/i,
  },
  {
    id: "blackboard",
    label: "Blackboard",
    instructions:
      "In Blackboard open Calendar, click the “Get External Calendar Link” icon, and copy the URL.",
    match: /blackboard\.com|\/calendar\/ics/i,
  },
  {
    id: "classroom",
    label: "Google Classroom",
    instructions:
      "Classroom pushes work to Google Calendar. In Google Calendar open Settings → your Classroom calendar → “Secret address in iCal format”, and copy it.",
    match: /calendar\.google\.com/i,
  },
  {
    id: "teams",
    label: "Microsoft Teams / Outlook",
    instructions:
      "In Outlook open Calendar → Share → Publish a calendar, choose “Can view all details”, and copy the ICS link.",
    match: /outlook\.(office|live)\.com|sharepoint/i,
  },
  {
    id: "other",
    label: "Other (any .ics feed)",
    instructions: "Paste any iCalendar (.ics) feed URL your school provides.",
  },
];

export function detectPlatform(url: string): LmsInfo {
  return (
    LMS_PLATFORMS.find((p) => p.match?.test(url)) ??
    LMS_PLATFORMS[LMS_PLATFORMS.length - 1]
  );
}

export type ImportCandidate = {
  /** Stable identity, so re-importing updates rather than duplicates. */
  externalId: string;
  title: string;
  details: string;
  dueAt: string | null;
  /** Best guess at the subject, taken from the course name in the event. */
  subject: string;
  /** True when this looks like an assignment rather than a lecture slot. */
  looksLikeAssignment: boolean;
};

/**
 * Turn a fetched .ics feed into importable candidates.
 *
 * LMS calendar feeds mix assignments with class meetings and admin events.
 * Everything is returned with a flag rather than filtered outright — guessing
 * wrong in either direction is worse than letting the student tick boxes.
 */
export function candidatesFromICS(icsText: string, now = new Date()): ImportCandidate[] {
  const events = parseICS(icsText);
  const out: ImportCandidate[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (!event.start) continue;

    // Anything more than a week old is history, not homework.
    const age = now.getTime() - event.start.getTime();
    if (age > 7 * 86_400_000) continue;

    const { subject, title } = splitCourseName(event.title);
    const externalId = event.uid ?? `${title}-${event.start.toISOString()}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    out.push({
      externalId,
      title,
      details: cleanDescription(event.description),
      dueAt: event.start.toISOString(),
      subject,
      looksLikeAssignment: looksLikeAssignment(event),
    });
  }

  return out.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
}

/*
  Canvas and Moodle both title events "Assignment name [Course name]" or
  "Course name: Assignment name". Pulling the course out gives a usable subject
  and stops it being repeated in every task title.
*/
function splitCourseName(raw: string): { subject: string; title: string } {
  const bracketed = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(raw);
  if (bracketed) {
    return { title: bracketed[1].trim() || raw, subject: tidySubject(bracketed[2]) };
  }

  const colon = /^([^:]{2,40}):\s+(.{3,})$/.exec(raw);
  if (colon) {
    return { title: colon[2].trim(), subject: tidySubject(colon[1]) };
  }

  return { subject: "General", title: raw.trim() };
}

/** Course codes like "PHYS-101-A Fall 2026" are noise as a subject name. */
function tidySubject(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\b(fall|spring|summer|autumn|winter)\s*\d{2,4}\b/gi, "");
  s = s.replace(/\b\d{4}-\d{2}\b/g, "");
  s = s.replace(/\s{2,}/g, " ").replace(/[-–—,]\s*$/, "").trim();
  return s.slice(0, 40) || "General";
}

const ASSIGNMENT_WORDS =
  /\b(assignment|homework|hw|due|submit|submission|essay|report|quiz|test|exam|project|lab|problem set|pset|worksheet|reading|presentation|draft|deadline)\b/i;

function looksLikeAssignment(event: ImportedEvent): boolean {
  if (ASSIGNMENT_WORDS.test(event.title)) return true;
  if (ASSIGNMENT_WORDS.test(event.description)) return true;
  // A recurring hour-long slot at a fixed time is a lecture; an all-day event
  // with a single date is far more likely to be a due date.
  return event.allDay;
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/g, (url) => (url.length > 80 ? "" : url))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500);
}

/** Feed URLs must be http(s) and public — this is a server-side fetch. */
export function validateFeedUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The feed URL must start with http:// or https://" };
  }

  // The server fetches this URL, so a private address would let a pasted link
  // probe the machine Scholar runs on. Refuse anything that isn't public.
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "[::1]";

  if (isPrivate) {
    return { ok: false, error: "That address isn't reachable as a public calendar feed." };
  }

  return { ok: true, url };
}
