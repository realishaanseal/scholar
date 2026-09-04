import { db, newId } from "@/lib/db";
import { audit } from "@/lib/governance";

/**
 * The register.
 *
 * Designed around the one minute a form tutor has. Opening a register
 * pre-fills everybody as present, because in almost every class almost
 * everybody is — and a teacher marking thirty students individually to record
 * two absences will stop taking the register in a fortnight.
 *
 * A correction is written to the audit log rather than silently applied. A
 * register is a legal document in most of the markets this is aimed at, and
 * "who changed this from absent to present, and when" has to be answerable
 * later by somebody who was not there.
 */

export type AttendanceState = "present" | "absent" | "late" | "excused";

export type AttendanceMark = {
  userId: string;
  name: string | null;
  email: string | null;
  state: AttendanceState;
  minutesLate: number | null;
  note: string;
};

export type Register = {
  sessionId: string;
  date: string;
  period: string | null;
  takenAt: string | null;
  marks: AttendanceMark[];
};

/**
 * Open the register for a day, creating it if nobody has taken it yet.
 *
 * Everybody starts present. That is not an assumption about the class, it is
 * an assumption about the interaction: the teacher is about to change the two
 * or three that differ, and starting from blank would mean thirty clicks to
 * record a normal morning.
 */
export async function openRegister(input: {
  organizationId: string;
  sectionId: string;
  date: string;
  period?: string | null;
  takenBy: string;
}): Promise<Register> {
  const period = input.period ?? null;

  const existing = await db
    .prepare(
      `SELECT id, on_date, period, taken_at FROM attendance_sessions
        WHERE course_section_id = ? AND on_date = ?::date
          AND period IS NOT DISTINCT FROM ?`
    )
    .get(input.sectionId, input.date, period);

  let sessionId: string;
  let takenAt: string | null = null;

  if (existing) {
    sessionId = (existing as any).id;
    const t = (existing as any).taken_at;
    takenAt = t instanceof Date ? t.toISOString() : t ? String(t) : null;
  } else {
    sessionId = newId();
    await db
      .prepare(
        `INSERT INTO attendance_sessions
           (id, organization_id, course_section_id, on_date, period, taken_by)
         VALUES (?, ?, ?, ?::date, ?, ?)`
      )
      .run(sessionId, input.organizationId, input.sectionId, input.date, period, input.takenBy);
  }

  // The roster, left-joined onto whatever has been recorded. A student who
  // joined the class today appears with no mark rather than not appearing.
  const rows = await db
    .prepare(
      `SELECT e.user_id, u.name, u.email,
              m.state, m.minutes_late, m.note
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN attendance_marks m
           ON m.session_id = ? AND m.user_id = e.user_id
        WHERE e.course_section_id = ? AND e.status = 'active'
        ORDER BY u.name NULLS LAST, u.email`
    )
    .all(sessionId, input.sectionId);

  return {
    sessionId,
    date: input.date,
    period,
    takenAt,
    marks: (rows as any[]).map((r) => ({
      userId: r.user_id,
      name: r.name ?? null,
      email: r.email ?? null,
      // Present is the default the register opens on, not a recorded fact.
      // Whether anybody has actually taken it is `takenAt`.
      state: (r.state ?? "present") as AttendanceState,
      minutesLate: r.minutes_late === null || r.minutes_late === undefined
        ? null
        : Number(r.minutes_late),
      note: r.note ?? "",
    })),
  };
}

/**
 * Record the register.
 *
 * Takes the whole class at once, because that is how a register is taken —
 * one act, not thirty. Anything that changes an existing mark is written to
 * the audit log with both values, since by then it is a correction to a legal
 * record rather than an entry.
 */
export async function recordRegister(input: {
  organizationId: string;
  sessionId: string;
  takenBy: string;
  marks: Array<{
    userId: string;
    state: AttendanceState;
    minutesLate?: number | null;
    note?: string;
  }>;
}): Promise<{ recorded: number; corrected: number }> {
  const before = new Map<string, string>(
    ((await db
      .prepare(`SELECT user_id, state FROM attendance_marks WHERE session_id = ?`)
      .all(input.sessionId)) as any[]).map((r) => [r.user_id, r.state])
  );

  let corrected = 0;

  for (const m of input.marks) {
    const was = before.get(m.userId);

    await db
      .prepare(
        `INSERT INTO attendance_marks
           (id, organization_id, session_id, user_id, state, minutes_late, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (session_id, user_id)
         DO UPDATE SET state = excluded.state,
                       minutes_late = excluded.minutes_late,
                       note = excluded.note,
                       updated_at = now()`
      )
      .run(
        newId(), input.organizationId, input.sessionId, m.userId, m.state,
        m.minutesLate ?? null, m.note ?? ""
      );

    // Only a change to something already recorded is a correction. The first
    // time a register is taken, everything is new and none of it is an
    // amendment to anything.
    if (was && was !== m.state) {
      corrected++;
      await audit({
        organizationId: input.organizationId,
        actorUserId: input.takenBy,
        action: "member:suspend",
        subjectType: "attendance:correction",
        subjectId: input.sessionId,
        detail: { student: m.userId, from: was, to: m.state },
      });
    }
  }

  await db
    .prepare(
      `UPDATE attendance_sessions SET taken_at = now(), taken_by = ? WHERE id = ?`
    )
    .run(input.takenBy, input.sessionId);

  return { recorded: input.marks.length, corrected };
}

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  sessions: number;
  /** Sessions attended over sessions held, 0-1. Null when none were held. */
  rate: number | null;
};

export type StudentAttendance = AttendanceSummary & {
  userId: string;
  name: string | null;
  email: string | null;
};

/**
 * Everyone's attendance over a period, for an administrator.
 *
 * The exit criterion for attendance was that an administrator can produce a
 * term's record for one student. Doing that by calling attendanceFor once per
 * student is one query per person and a page that gets slower every September,
 * so the aggregate happens in Postgres and the whole roster comes back once.
 *
 * Ordered by name, deliberately. Sorting a register worst-first turns a
 * statutory record into a ranking of children, which is a different document
 * with a different purpose, and not one an attendance screen should quietly
 * become.
 */
export async function attendanceForOrganization(
  organizationId: string,
  from: string,
  to: string
): Promise<StudentAttendance[]> {
  const rows = await db
    .prepare(
      `SELECT m.user_id,
              u.name  AS name,
              u.email AS email,
              COUNT(*) FILTER (WHERE m.state = 'present')::int AS present,
              COUNT(*) FILTER (WHERE m.state = 'absent')::int  AS absent,
              COUNT(*) FILTER (WHERE m.state = 'late')::int    AS late,
              COUNT(*) FILTER (WHERE m.state = 'excused')::int AS excused,
              COUNT(*)::int AS sessions
         FROM attendance_marks m
         JOIN attendance_sessions s ON s.id = m.session_id
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ?
          AND s.on_date BETWEEN ?::date AND ?::date
        GROUP BY m.user_id, u.name, u.email
        ORDER BY u.name NULLS LAST, m.user_id`
    )
    .all(organizationId, from, to);

  return (rows as any[]).map((r) => {
    const present = Number(r.present ?? 0);
    const absent = Number(r.absent ?? 0);
    const late = Number(r.late ?? 0);
    const excused = Number(r.excused ?? 0);
    const sessions = Number(r.sessions ?? 0);
    return {
      userId: r.user_id,
      name: r.name ?? null,
      email: r.email ?? null,
      present,
      absent,
      late,
      excused,
      sessions,
      // Identical to attendanceFor, rounding included: the same student must
      // not read 94% on the roster and 93.5% on their own page.
      rate: sessions === 0
        ? null
        : Math.round(((present + late + excused) / sessions) * 100) / 100,
    };
  });
}

/**
 * One student's attendance over a period.
 *
 * What a form tutor, a parent and an education welfare officer all ask for.
 * 'excused' counts as attending for the rate, because an authorised absence
 * is not a mark against anybody and a percentage that punishes a hospital
 * appointment is a percentage nobody should act on.
 */
export async function attendanceFor(
  userId: string,
  sectionId: string | null,
  from: string,
  to: string
): Promise<AttendanceSummary> {
  const r = await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE m.state = 'present')::int AS present,
         COUNT(*) FILTER (WHERE m.state = 'absent')::int  AS absent,
         COUNT(*) FILTER (WHERE m.state = 'late')::int    AS late,
         COUNT(*) FILTER (WHERE m.state = 'excused')::int AS excused,
         COUNT(*)::int AS sessions
       FROM attendance_marks m
       JOIN attendance_sessions s ON s.id = m.session_id
      WHERE m.user_id = ?
        AND (?::text IS NULL OR s.course_section_id = ?)
        AND s.on_date BETWEEN ?::date AND ?::date`
    )
    .get(userId, sectionId, sectionId, from, to);

  const present = Number((r as any)?.present ?? 0);
  const late = Number((r as any)?.late ?? 0);
  const excused = Number((r as any)?.excused ?? 0);
  const absent = Number((r as any)?.absent ?? 0);
  const sessions = Number((r as any)?.sessions ?? 0);

  return {
    present, absent, late, excused, sessions,
    rate: sessions === 0
      ? null
      : Math.round(((present + late + excused) / sessions) * 100) / 100,
  };
}

/** Registers taken for a section, most recent first. */
export async function recentRegisters(
  sectionId: string,
  limit = 30
): Promise<Array<{ sessionId: string; date: string; taken: boolean; present: number; total: number }>> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.on_date, s.taken_at,
              COUNT(m.id) FILTER (WHERE m.state IN ('present','late','excused'))::int AS present,
              COUNT(m.id)::int AS total
         FROM attendance_sessions s
         LEFT JOIN attendance_marks m ON m.session_id = s.id
        WHERE s.course_section_id = ?
        GROUP BY s.id, s.on_date, s.taken_at
        ORDER BY s.on_date DESC
        LIMIT ?`
    )
    .all(sectionId, Math.min(200, Math.max(1, limit)));

  return (rows as any[]).map((r) => ({
    sessionId: r.id,
    date: r.on_date instanceof Date
      ? r.on_date.toISOString().slice(0, 10)
      : String(r.on_date).slice(0, 10),
    taken: Boolean(r.taken_at),
    present: Number(r.present ?? 0),
    total: Number(r.total ?? 0),
  }));
}
