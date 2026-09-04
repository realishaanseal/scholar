import { db } from "@/lib/db";

/**
 * What the institution has set, and when it all falls due.
 *
 * Every teacher can see the collisions inside their own class. Nobody can see
 * that Year 11 has four pieces due on the same Friday across three
 * departments, because no single teacher is looking at more than one of them.
 * That view exists only at this level, which is the argument for building it
 * here rather than adding another warning to the composer.
 *
 * Read entirely from assignments — what staff set, and when. No student
 * appears in any query in this file, and no count of people is returned. The
 * subject is the timetable of work, not the children doing it, and that is the
 * distinction that keeps this the right side of the line Phase 10 drew when it
 * refused engagement metrics.
 */

export type LoadDay = {
  /** YYYY-MM-DD in the institution's own clock. */
  day: string;
  pieces: number;
  /** Summed estimated_mins where teachers supplied one. */
  estimatedMins: number;
  /** How many of the pieces carry no estimate, so the total is a floor. */
  unestimated: number;
  courses: string[];
  departments: string[];
};

export type AssessmentLoad = {
  days: LoadDay[];
  /** Days above the busy threshold, worst first. Empty when nothing collides. */
  heaviest: LoadDay[];
};

/**
 * A day is worth flagging above this much work landing at once.
 *
 * Four hours is a evening a student does not have. Deliberately a quantity of
 * work rather than a count of pieces: three short exercises and one long essay
 * are not the same Friday, and a threshold counting pieces would say they were.
 */
export const BUSY_MINS = 240;

export async function assessmentLoad(
  organizationId: string,
  from: string,
  to: string
): Promise<AssessmentLoad> {
  const rows = await db
    .prepare(
      `SELECT to_char(a.due_at, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS pieces,
              COALESCE(SUM(a.estimated_mins), 0)::int AS estimated_mins,
              COUNT(*) FILTER (WHERE a.estimated_mins IS NULL)::int AS unestimated,
              ARRAY_AGG(DISTINCT c.code) AS courses,
              ARRAY_AGG(DISTINCT COALESCE(d.name, '')) AS departments
         FROM assignments a
         JOIN course_sections cs ON cs.id = a.course_section_id
         JOIN courses c ON c.id = cs.course_id
         LEFT JOIN departments d ON d.id = c.department_id
        WHERE a.organization_id = ?
          AND a.status = 'published'
          AND a.due_at IS NOT NULL
          AND a.due_at >= ?::date
          AND a.due_at < (?::date + INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1`
    )
    .all(organizationId, from, to);

  const days: LoadDay[] = (rows as any[]).map((r) => ({
    day: r.day,
    pieces: Number(r.pieces ?? 0),
    estimatedMins: Number(r.estimated_mins ?? 0),
    unestimated: Number(r.unestimated ?? 0),
    courses: (r.courses ?? []).filter(Boolean),
    departments: (r.departments ?? []).filter(Boolean),
  }));

  const heaviest = days
    .filter((d) => d.estimatedMins >= BUSY_MINS && d.courses.length > 1)
    .sort((a, b) => b.estimatedMins - a.estimatedMins);

  return { days, heaviest };
}
