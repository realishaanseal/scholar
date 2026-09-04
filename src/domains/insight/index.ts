import { db } from "@/lib/db";
import { getAvailability, paceBySubject } from "@/lib/scholar/memory";
import { calibrateEstimate, deadlineCollisions, planStart } from "./plan";
import type { CollisionWarning, WorkPlan } from "./plan";

export * from "./plan";
export * from "./student";

/**
 * Where the institution's data meets what Scholar knows about the student.
 *
 * The Phase 0 audit's test for scope creep was to prefer anything
 * strengthening the institution → intelligence link over LMS feature parity.
 * This module is that link: everything here reads institutional rows and
 * answers a question only the personal layer can answer.
 *
 * The direction of the dependency matters. Insight reads from the
 * institutional side and never writes to it — an assignment's deadline is not
 * something Scholar gets to move because it decided the week was busy. It can
 * say so, to the student and to the teacher, and that is all.
 */

/**
 * Plan one student's outstanding coursework.
 *
 * Loads the student's pace and availability once and applies them across
 * every assignment, rather than per item: a term's worth of work would
 * otherwise mean a query per row to answer a question about the same person.
 */
export async function planCoursework(
  userId: string,
  sectionId: string,
  now: Date = new Date()
): Promise<WorkPlan[]> {
  const [rows, pace, profile] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.title, a.due_at, a.estimated_mins, c.title AS subject
           FROM assignments a
           JOIN course_sections cs ON cs.id = a.course_section_id
           JOIN courses c ON c.id = cs.course_id
          WHERE a.course_section_id = ?
            AND a.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM assignment_submissions s
               WHERE s.assignment_id = a.id AND s.user_id = ?
            )
          ORDER BY a.due_at NULLS LAST`
      )
      .all(sectionId, userId),
    paceBySubject(userId),
    getAvailability(userId),
  ]);

  return (rows as any[]).map((r) => {
    const teacherMins =
      r.estimated_mins === null || r.estimated_mins === undefined
        ? null
        : Number(r.estimated_mins);

    const { mins, adjusted, reason } = calibrateEstimate(teacherMins, pace[r.subject]);

    const dueAt = r.due_at instanceof Date ? r.due_at : r.due_at ? new Date(r.due_at) : null;

    return {
      assignmentId: r.id,
      title: String(r.title ?? ""),
      dueAt: dueAt ? dueAt.toISOString() : null,
      teacherMins,
      expectedMins: mins,
      adjusted,
      reason,
      plan: planStart(dueAt, mins, profile, now),
    };
  });
}

/**
 * What is already due on a given day for one class.
 *
 * Asked by the teacher's editor before a deadline is set, so the warning
 * arrives while the date can still be changed painlessly. Counts published
 * work only: a draft is not yet a demand on anyone's evening.
 */
export async function sectionDeadlineLoad(
  sectionId: string,
  excludeAssignmentId: string | null = null
): Promise<{ day: string; existing: number; estimatedMins: number }[]> {
  const rows = await db
    .prepare(
      `SELECT to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS existing,
              COALESCE(SUM(estimated_mins), 0)::int AS estimated_mins
         FROM assignments
        WHERE course_section_id = ?
          AND status = 'published'
          AND due_at IS NOT NULL
          -- Cast required: a parameter whose only use is IS NULL gives
          -- Postgres nothing to infer a type from, and it refuses to guess.
          AND (?::text IS NULL OR id <> ?)
        GROUP BY 1`
    )
    .all(sectionId, excludeAssignmentId, excludeAssignmentId);

  return (rows as any[]).map((r) => ({
    day: String(r.day),
    existing: Number(r.existing),
    estimatedMins: Number(r.estimated_mins),
  }));
}

/** The warning for one proposed deadline, or null when the day is clear. */
export async function checkDeadline(
  sectionId: string,
  proposedDay: string,
  proposedMins: number | null,
  excludeAssignmentId: string | null = null
): Promise<CollisionWarning | null> {
  const load = await sectionDeadlineLoad(sectionId, excludeAssignmentId);
  return deadlineCollisions(load, proposedDay, proposedMins);
}

/* ── The institution's own health ──────────────────────────────────────── */

import { courseConcerns } from "./institution";
import type { CourseHealth, MarkingHealth } from "./institution";

export * from "./institution";

/**
 * Marking turnaround across an institution.
 *
 * Bounded to a window because "since the beginning of time" is not a question
 * anyone is asking, and an unbounded scan of every submission an institution
 * has ever received would get slower every term.
 */
export async function institutionMarkingHealth(
  organizationId: string,
  days = 90
): Promise<MarkingHealth> {
  // Aggregated in the database rather than in JavaScript.
  //
  // This used to select every submission in the window and compute the median
  // over the returned rows. That is correct and it does not scale: a
  // five-thousand-student institution puts six figures of rows on the wire to
  // produce four numbers. percentile_cont gives an exact median in the
  // database, and the index on (organization_id, submitted_at) means the scan
  // is bounded by the window rather than by the table.
  //
  // markingHealth() is still the definition of these figures and still tested
  // against the cases that matter — it is used wherever rows are already in
  // hand. This is the same arithmetic expressed where the rows live.
  const r = await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE graded_at IS NOT NULL)::int AS marked,
         COUNT(*) FILTER (WHERE graded_at IS NULL)::int     AS outstanding,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (graded_at - submitted_at)) / 86400
         ) FILTER (WHERE graded_at IS NOT NULL AND graded_at >= submitted_at)
           AS median_days,
         MAX(EXTRACT(EPOCH FROM (now() - submitted_at)) / 86400)
           FILTER (WHERE graded_at IS NULL) AS worst_wait
       FROM assignment_submissions
      WHERE organization_id = ?
        AND submitted_at IS NOT NULL
        AND submitted_at > now() - make_interval(days => ?)`
    )
    .get(organizationId, days);

  const marked = Number((r as any)?.marked ?? 0);
  const outstanding = Number((r as any)?.outstanding ?? 0);
  const total = marked + outstanding;
  const median = (r as any)?.median_days;
  const worst = (r as any)?.worst_wait;

  return {
    marked,
    outstanding,
    medianDays: median === null || median === undefined ? null : round1(Number(median)),
    worstWaitDays: worst === null || worst === undefined ? null : round1(Number(worst)),
    returnRate: total === 0 ? null : Math.round((marked / total) * 100) / 100,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Every course, with the ones needing attention marked.
 *
 * One query rather than one per course: an institution with two hundred
 * courses should not cost two hundred round trips to draw a page that mostly
 * says everything is fine.
 */
export async function institutionCourseHealth(
  organizationId: string
): Promise<CourseHealth[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.code, c.title,
              COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'published')::int AS published,
              COUNT(s.id) FILTER (WHERE s.status = 'submitted')::int AS outstanding,
              MAX(EXTRACT(EPOCH FROM (now() - s.submitted_at)) / 86400)
                FILTER (WHERE s.status = 'submitted') AS worst_wait
         FROM courses c
         LEFT JOIN course_sections cs ON cs.course_id = c.id
         LEFT JOIN assignments a ON a.course_section_id = cs.id
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
        WHERE c.organization_id = ?
        GROUP BY c.id, c.code, c.title
        ORDER BY c.code`
    )
    .all(organizationId);

  return courseConcerns(
    (rows as any[]).map((r) => ({
      courseId: r.id,
      code: String(r.code ?? ""),
      title: String(r.title ?? ""),
      published: Number(r.published ?? 0),
      outstanding: Number(r.outstanding ?? 0),
      worstWaitDays:
        r.worst_wait === null || r.worst_wait === undefined ? null : Number(r.worst_wait),
    }))
  );
}


/* ── The week ──────────────────────────────────────────────────────────── */

import { calibration, orderOfWork, timeBudget } from "./week";
import type { Calibration, Sequenced, TimeBudget, WorkItem } from "./week";

export * from "./week";

/**
 * Everything a student still owes, across every course.
 *
 * Estimates are calibrated the same way the per-course planner calibrates
 * them, so the number in the week view and the number on the assignment agree.
 * Two places computing the same figure differently is how a student stops
 * believing either.
 */
export async function outstandingWork(
  userId: string,
  organizationId: string
): Promise<WorkItem[]> {
  const [rows, pace] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.title, a.due_at, a.estimated_mins,
                c.code, c.title AS subject, cs.id AS section_id
           FROM enrollments e
           JOIN course_sections cs ON cs.id = e.course_section_id
           JOIN courses c ON c.id = cs.course_id
           JOIN assignments a ON a.course_section_id = cs.id AND a.status = 'published'
          WHERE e.user_id = ? AND e.status = 'active'
            AND cs.organization_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM assignment_submissions s
               WHERE s.assignment_id = a.id AND s.user_id = e.user_id
            )
            AND (
              NOT EXISTS (SELECT 1 FROM assignment_assignees x WHERE x.assignment_id = a.id)
              OR EXISTS (
                SELECT 1 FROM assignment_assignees x
                 WHERE x.assignment_id = a.id AND x.user_id = e.user_id
              )
            )
          ORDER BY a.due_at NULLS LAST`
      )
      .all(userId, organizationId),
    paceBySubject(userId),
  ]);

  return (rows as any[]).map((r) => {
    const teacherMins =
      r.estimated_mins === null || r.estimated_mins === undefined
        ? null
        : Number(r.estimated_mins);
    return {
      id: r.id,
      title: String(r.title ?? ""),
      courseCode: String(r.code ?? ""),
      sectionId: r.section_id,
      dueAt: r.due_at instanceof Date ? r.due_at : r.due_at ? new Date(r.due_at) : null,
      estimateMins: calibrateEstimate(teacherMins, pace[r.subject]).mins,
    };
  });
}

export type WeekPlan = {
  budget: TimeBudget;
  order: Sequenced[];
};

/** The whole week: how much time there is, and what to do first. */
export async function planWeek(
  userId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<WeekPlan> {
  const [items, profile] = await Promise.all([
    outstandingWork(userId, organizationId),
    getAvailability(userId),
  ]);

  return {
    budget: timeBudget(items, profile, now),
    order: orderOfWork(items, profile, now),
  };
}

/**
 * What this student's own estimates have been worth.
 *
 * Read from task_events, which has been recording estimate against actual
 * since long before there was an institution in the picture. Scholar has been
 * using it to correct the numbers it shows and never telling anybody — which
 * is the wrong way round, because somebody who knows their physics estimates
 * run short can act on it, and somebody whose estimates are silently
 * corrected learns nothing.
 */
export async function estimateReceipts(userId: string): Promise<Calibration> {
  const rows = await db
    .prepare(
      `SELECT subjectName AS subject, estimateMins, actualMins
         FROM task_events
        WHERE userId = ? AND estimateMins > 0 AND actualMins > 0
        ORDER BY createdAt DESC
        LIMIT 400`
    )
    .all(userId);

  return calibration(
    (rows as any[]).map((r) => ({
      subject: String(r.subject ?? "Other"),
      estimateMins: Number(r.estimateMins ?? 0),
      actualMins: Number(r.actualMins ?? 0),
    }))
  );
}

/**
 * Finished work with both a deadline and a measured duration.
 *
 * Feeds finishingMargins. Personal tables only, and scoped to one user — the
 * shape of this read is why the margins module never needs to know who it is
 * describing.
 */
export async function finishedWithDeadlines(userId: string) {
  const rows = await db
    .prepare(
      `SELECT "dueAt", "completedAt", "estimateMins", "actualMins"
         FROM task_events
        WHERE "userId" = ?
          AND "dueAt" IS NOT NULL AND "dueAt" <> ''
          AND "estimateMins" > 0
          AND "actualMins" > 0
        ORDER BY "completedAt" DESC
        LIMIT 200`
    )
    .all(userId);

  return (rows as any[])
    .map((r) => ({
      dueAt: new Date(r.dueAt),
      completedAt: new Date(r.completedAt),
      estimateMins: Number(r.estimateMins),
      actualMins: Number(r.actualMins),
    }))
    .filter(
      (p) => !Number.isNaN(p.dueAt.getTime()) && !Number.isNaN(p.completedAt.getTime())
    );
}
