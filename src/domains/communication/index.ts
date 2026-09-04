import { db, newId } from "@/lib/db";

/**
 * Saying things to people.
 *
 * Deliberately one object for two cases. A head of year telling the school
 * about an inset day and a teacher telling one class about a room change are
 * the same shape — a title, some words, an audience — and modelling them
 * separately would mean two of everything for a distinction that is just
 * whether a section id is null.
 *
 * Nothing here sends email. Scholar has no mail infrastructure, and an
 * announcement a teacher believes was delivered and a student never received
 * is worse than no announcement. These live where the audience already is.
 */

export type Announcement = {
  id: string;
  sectionId: string | null;
  title: string;
  body: string;
  authorLabel: string;
  publishedAt: string | null;
  createdAt: string;
};

function map(r: any): Announcement {
  const iso = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;
  return {
    id: r.id,
    sectionId: r.course_section_id ?? null,
    title: r.title,
    body: r.body ?? "",
    authorLabel: r.author_label ?? "",
    publishedAt: iso(r.published_at),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
  };
}

const COLUMNS = `id, course_section_id, title, body, author_label, published_at, created_at`;

/**
 * Post something.
 *
 * Published immediately unless asked otherwise, because the common case is
 * somebody typing a sentence and wanting it seen. Saving a draft is the
 * deliberate act and should be the one that takes an extra click.
 */
export async function announce(input: {
  organizationId: string;
  sectionId: string | null;
  title: string;
  body: string;
  createdBy: string;
  /** Resolved here when not supplied, so no caller has to remember. */
  authorLabel?: string;
  publish?: boolean;
}): Promise<Announcement> {
  const id = newId();

  // The author's own name, denormalised at write time. Looked up here rather
  // than passed in because the Actor the routes hold carries no email, and a
  // label that is sometimes filled in is worse than one that always is.
  const label =
    input.authorLabel ??
    (await db
      .prepare(`SELECT COALESCE(name, email, '') AS label FROM users WHERE id = ?`)
      .get(input.createdBy)
      .then((r: any) => String(r?.label ?? ""))
      .catch(() => ""));
  await db
    .prepare(
      `INSERT INTO announcements
         (id, organization_id, course_section_id, title, body, created_by,
          author_label, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${input.publish === false ? "NULL" : "now()"})`
    )
    .run(
      id, input.organizationId, input.sectionId, input.title, input.body,
      input.createdBy, label
    );

  const r = await db
    .prepare(`SELECT ${COLUMNS} FROM announcements WHERE id = ?`)
    .get(id);
  return map(r);
}

/**
 * What a student in this section should see.
 *
 * The section's own announcements and the institution's, in one list, newest
 * first. Two queries and a merge in JavaScript would produce the same rows
 * and make "what is new since Tuesday" impossible to ask in one place.
 */
export async function announcementsFor(
  organizationId: string,
  sectionId: string,
  limit = 20
): Promise<Announcement[]> {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM announcements
        WHERE organization_id = ?
          AND (course_section_id = ? OR course_section_id IS NULL)
          AND published_at IS NOT NULL
        ORDER BY published_at DESC
        LIMIT ?`
    )
    .all(organizationId, sectionId, Math.min(100, Math.max(1, limit)));
  return (rows as any[]).map(map);
}

/** Everything for a section, drafts included — the teacher's own view. */
export async function sectionAnnouncements(
  sectionId: string,
  limit = 50
): Promise<Announcement[]> {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM announcements
        WHERE course_section_id = ?
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT ?`
    )
    .all(sectionId, Math.min(200, Math.max(1, limit)));
  return (rows as any[]).map(map);
}

/** Institution-wide, for the admin console. */
export async function institutionAnnouncements(
  organizationId: string,
  limit = 50
): Promise<Announcement[]> {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM announcements
        WHERE organization_id = ? AND course_section_id IS NULL
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT ?`
    )
    .all(organizationId, Math.min(200, Math.max(1, limit)));
  return (rows as any[]).map(map);
}

export async function deleteAnnouncement(
  organizationId: string,
  id: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM announcements WHERE id = ? AND organization_id = ?`)
    .run(id, organizationId);
}

/* ── Releasing marks ───────────────────────────────────────────────────── */

/**
 * Post every mark on one assignment.
 *
 * The action a teacher takes after marking a pile over several days. Only
 * touches submissions that have actually been graded — posting an unmarked
 * one would release nothing and set a timestamp that later reads as a lie.
 *
 * Returns how many became visible, because "posted" with no number is
 * indistinguishable from "posted nothing", and a teacher who forgot to grade
 * three of them should find out now.
 */
export async function postGrades(assignmentId: string): Promise<number> {
  const rows = await db
    .prepare(
      `UPDATE assignment_submissions
          SET posted_at = now()
        WHERE assignment_id = ?
          AND graded_at IS NOT NULL
          AND posted_at IS NULL
      RETURNING id`
    )
    .all(assignmentId);
  return (rows as any[]).length;
}

/** Hide them again. Rare, and occasionally necessary after a marking error. */
export async function unpostGrades(assignmentId: string): Promise<number> {
  const rows = await db
    .prepare(
      `UPDATE assignment_submissions
          SET posted_at = NULL
        WHERE assignment_id = ? AND posted_at IS NOT NULL
      RETURNING id`
    )
    .all(assignmentId);
  return (rows as any[]).length;
}

/** How many marks are written but not yet released. */
export async function heldBack(assignmentId: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*)::int AS c FROM assignment_submissions
        WHERE assignment_id = ? AND graded_at IS NOT NULL AND posted_at IS NULL`
    )
    .get(assignmentId);
  return Number((r as any)?.c ?? 0);
}
