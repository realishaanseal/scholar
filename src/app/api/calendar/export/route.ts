import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listHomework } from "@/lib/queries";
import { db } from "@/lib/db";
import { buildICS, type CalendarEvent } from "@/lib/calendar/ics";

export const runtime = "nodejs";

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * Download every deadline (and optionally the class timetable) as one .ics file.
 *
 * Returned as a file rather than a subscription URL: a subscribable feed would
 * need a public, authenticated endpoint, and this build runs on localhost.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeClasses = url.searchParams.get("classes") !== "0";
  const includeDone = url.searchParams.get("done") === "1";

  const events: CalendarEvent[] = [];

  for (const hw of await listHomework(session.user.id)) {
    if (!hw.dueAt) continue;
    if (!includeDone && hw.status === "done") continue;

    const due = new Date(hw.dueAt);
    if (Number.isNaN(due.getTime())) continue;

    const description = [
      hw.details,
      hw.estimateMins ? `Estimated ${hw.estimateMins} minutes.` : "",
      "— Varaxis Scholar",
    ]
      .filter(Boolean)
      .join("\n");

    events.push({
      // Stable UID per task, so re-importing updates the existing event rather
      // than creating a duplicate every time the student exports.
      uid: `hw-${hw.id}@varaxis-scholar`,
      title: `${hw.subject?.name ? `${hw.subject.name}: ` : ""}${hw.title}`,
      description,
      start: due,
      end: new Date(due.getTime() + Math.max(15, hw.estimateMins ?? 30) * 60_000),
      location: undefined,
    });
  }

  if (includeClasses) {
    const classes = (await db
      .prepare(
        `SELECT id, title, subjectName, dayOfWeek, startHour, startMin, endHour, endMin, location
           FROM timetable WHERE userId = ?`
      )
      .all(session.user.id)) as Array<{
        id: string; title: string; subjectName: string | null; dayOfWeek: number;
        startHour: number; startMin: number; endHour: number; endMin: number; location: string | null;
      }>;

    for (const c of classes) {
      const start = nextOccurrence(c.dayOfWeek, c.startHour, c.startMin);
      const end = new Date(start);
      end.setHours(c.endHour, c.endMin, 0, 0);

      events.push({
        uid: `class-${c.id}@varaxis-scholar`,
        title: c.title,
        description: c.subjectName ? `${c.subjectName} — Varaxis Scholar` : "Varaxis Scholar",
        start,
        end,
        location: c.location ?? undefined,
        recurrence: `FREQ=WEEKLY;BYDAY=${DAY_CODES[c.dayOfWeek] ?? "MO"}`,
      });
    }
  }

  const ics = buildICS(events, "Varaxis Scholar");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="varaxis-scholar.ics"',
    },
  });
}

/** The next date matching a weekday, used as the anchor for a weekly rule. */
function nextOccurrence(dayOfWeek: number, hour: number, minute: number): Date {
  const d = new Date();
  const delta = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  d.setHours(hour, minute, 0, 0);
  return d;
}
