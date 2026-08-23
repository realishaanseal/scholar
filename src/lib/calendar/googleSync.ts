import { deleteHomework, listHomework, updateHomework, type UpdateHomeworkPatch } from "../queries";
import type { HomeworkDTO } from "../clientTypes";
import {
  deleteEvent,
  insertEvent,
  listEvents,
  updateEvent,
  type EventInput,
  type GoogleEvent,
} from "./google";
import {
  deleteLinkByHomeworkId,
  getLinkByHomeworkId,
  getLinkByEventId,
  getSyncToken,
  listLinkedHomeworkIds,
  markSynced,
  setSyncError,
  setSyncToken,
  upsertLinkPulled,
  upsertLinkPushed,
} from "./googleStore";

/**
 * Two-way sync between Scholar homework and one Google Calendar.
 *
 * Scope, deliberately: sync only ever acts on tasks/events it created the
 * link for. Pushing creates that link; a Google event that isn't linked is
 * left alone on pull, not imported as a new task. Importing a student's
 * entire Google Calendar as "homework" would mean a dentist appointment or a
 * friend's birthday shows up as an assignment — the LMS ICS import already
 * covers "bring outside coursework in," and that's a deliberate, reviewed
 * action (the student picks what to import). This sync instead answers a
 * narrower, safer question: "keep the tasks I already have in step with my
 * calendar," in both directions, for exactly the items the two sides agree
 * on. See `providers.ts`'s note that this pattern is deliberate elsewhere in
 * the codebase too ("must never modify or delete an event it did not create").
 *
 * Conflict rule: last write wins, decided per item by comparing timestamps —
 * a homework row's `updatedAt` against the Google event's `updated` field —
 * rather than a merge UI. Simple, predictable, and matches what most
 * calendar-sync tools actually do under the hood.
 */

const SOURCE_TAG = { source: "varaxis-scholar" };

function buildEventInput(hw: HomeworkDTO, due: Date): EventInput {
  const durationMins = Math.max(15, hw.estimateMins ?? 30);
  const description = [
    hw.details,
    hw.estimateMins ? `Estimated ${hw.estimateMins} minutes.` : "",
    "— Varaxis Scholar",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: `${hw.subject?.name ? `${hw.subject.name}: ` : ""}${hw.title}`,
    description,
    start: { dateTime: due.toISOString() },
    end: { dateTime: new Date(due.getTime() + durationMins * 60_000).toISOString() },
    extendedProperties: { private: SOURCE_TAG },
  };
}

export type SyncResult = {
  pushed: { created: number; updated: number; removed: number };
  pulled: { updated: number; removed: number };
};

/**
 * The `CalendarSync` contract from providers.ts, backed by this module —
 * the concrete implementation the scaffold there was written in advance of.
 * `/api/calendar/google/sync` calls `runSync` directly rather than through
 * this factory (it already has the connection details in hand from the DB
 * lookup it just did); this exists so any future caller that only has a
 * `CalendarSync` reference — not sync-specific plumbing — can still drive it.
 */
export function createGoogleCalendarSync(
  userId: string,
  accessToken: string,
  calendarId: string
): import("./providers").CalendarSync {
  return {
    id: "google",
    async listBusy(from: Date, to: Date) {
      const { events } = await listEvents(accessToken, calendarId, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
      });
      return events
        .filter((e) => e.status !== "cancelled" && e.start && e.end)
        .map((e) => ({
          start: new Date((e.start!.dateTime ?? e.start!.date)!),
          end: new Date((e.end!.dateTime ?? e.end!.date)!),
          title: e.summary ?? "Busy",
        }));
    },
    async pushEvents() {
      const { created, updated } = await push(userId, accessToken, calendarId);
      return { created, updated };
    },
  };
}

export async function runSync(userId: string, accessToken: string, calendarId: string): Promise<SyncResult> {
  try {
    const pulled = await pull(userId, accessToken, calendarId);
    const pushed = await push(userId, accessToken, calendarId);
    await markSynced(userId);
    return { pushed, pulled };
  } catch (err: any) {
    await setSyncError(userId, err?.message ?? "Sync failed for an unknown reason.");
    throw err;
  }
}

async function push(userId: string, accessToken: string, calendarId: string) {
  const homework = await listHomework(userId);
  const homeworkById = new Map(homework.map((h) => [h.id, h]));
  const linkedIds = await listLinkedHomeworkIds(userId);

  let created = 0;
  let updated = 0;
  let removed = 0;

  // Reconcile first: a linked task that's gone or completed should have its
  // calendar event removed, so a finished/deleted assignment doesn't linger
  // on the student's calendar as a phantom deadline.
  for (const homeworkId of linkedIds) {
    const hw = homeworkById.get(homeworkId);
    if (hw && hw.status !== "done" && hw.dueAt) continue;

    const link = await getLinkByHomeworkId(userId, homeworkId);
    if (!link) continue;
    try {
      await deleteEvent(accessToken, calendarId, link.externalEventId);
    } catch {
      // Already gone on Google's side, or a transient error — either way,
      // the link itself is now stale and shouldn't be retried forever.
    }
    await deleteLinkByHomeworkId(userId, homeworkId);
    removed++;
  }

  for (const hw of homework) {
    if (!hw.dueAt || hw.status === "done") continue;
    const due = new Date(hw.dueAt);
    if (Number.isNaN(due.getTime())) continue;

    const input = buildEventInput(hw, due);
    const link = await getLinkByHomeworkId(userId, hw.id);

    if (!link) {
      const event = await insertEvent(accessToken, calendarId, input);
      await upsertLinkPushed(userId, hw.id, event.id);
      created++;
      continue;
    }

    // Only push when this task changed locally since the last push — an
    // unconditional rewrite every sync run would be wasted API calls and
    // would also stomp a same-round-trip pull (see the skip-echo check in
    // pull() below, which relies on lastPushedAt being a true "last touched").
    const changedSincePush =
      new Date(hw.updatedAt).getTime() > new Date(link.lastPushedAt ?? 0).getTime();
    if (changedSincePush) {
      await updateEvent(accessToken, calendarId, link.externalEventId, input);
      await upsertLinkPushed(userId, hw.id, link.externalEventId);
      updated++;
    }
  }

  return { created, updated, removed };
}

async function pull(userId: string, accessToken: string, calendarId: string) {
  let syncToken = await getSyncToken(userId);
  let result = await listEvents(accessToken, calendarId, {
    syncToken,
    timeMin: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    timeMax: new Date(Date.now() + 2 * 365 * 86_400_000).toISOString(),
  });

  if (result.syncTokenExpired) {
    // The stored cursor is no longer valid (typically: too much time passed
    // since the last sync). Google's own guidance is to drop it and do a
    // fresh full-window pull, which is exactly the `timeMin`/`timeMax` path.
    await setSyncToken(userId, null);
    result = await listEvents(accessToken, calendarId, {
      syncToken: null,
      timeMin: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      timeMax: new Date(Date.now() + 2 * 365 * 86_400_000).toISOString(),
    });
  }

  let updated = 0;
  let removed = 0;

  for (const event of result.events) {
    const link = await getLinkByEventId(userId, event.id);
    if (!link) continue; // Not one of ours — see the module-level scope note.

    if (event.status === "cancelled") {
      await deleteHomework(userId, link.homeworkId);
      removed++;
      continue;
    }

    // Skip-our-own-echo: if Google's reported update time is no newer than
    // when we last pushed this event, this is just our own write reflected
    // back by the API, not a genuine edit made on the Google Calendar side.
    const remoteUpdatedAt = event.updated ? new Date(event.updated).getTime() : 0;
    const lastPushedAt = link.lastPushedAt ? new Date(link.lastPushedAt).getTime() : 0;
    if (remoteUpdatedAt <= lastPushedAt) continue;

    const applied = await applyEventToHomework(userId, link.homeworkId, event);
    if (applied) {
      await upsertLinkPulled(userId, link.homeworkId, event.id);
      updated++;
    }
  }

  if (result.nextSyncToken) await setSyncToken(userId, result.nextSyncToken);

  return { updated, removed };
}

async function applyEventToHomework(userId: string, homeworkId: string, event: GoogleEvent): Promise<boolean> {
  const startRaw = event.start?.dateTime ?? event.start?.date;
  if (!startRaw) return false;
  const due = new Date(startRaw);
  if (Number.isNaN(due.getTime())) return false;

  const patch: UpdateHomeworkPatch = {
    title: (event.summary ?? "Untitled event").slice(0, 160),
    dueAt: due.toISOString(),
  };
  if (event.description !== undefined) patch.details = (event.description ?? "").slice(0, 4000);

  const result = await updateHomework(userId, homeworkId, patch);
  return Boolean(result);
}
