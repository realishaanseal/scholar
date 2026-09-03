import { db } from "@/lib/db";

/**
 * What Scholar holds about a person, and how to make it stop.
 *
 * Two obligations that sound similar and are not. A subject access request
 * asks what you have; erasure asks you to not have it. Both have statutory
 * clocks attached — one month under GDPR and the UK GDPR — and an institution
 * that has to open a database console to answer either one will miss them.
 *
 * The interesting problem is erasure against an audit trail. Article 17 says
 * remove the personal data; the audit log exists precisely so that what
 * happened cannot be removed. Both are right, and the schema already resolves
 * it: every column that IS a person's data cascades, and every column that
 * RECORDS what a person did is ON DELETE SET NULL. So deleting the user row
 * takes the coursework, the timetable, the study history and the settings,
 * while the fact that a grade changed on a date survives with nobody attached
 * to it.
 *
 * The one thing the database cannot do by itself is the denormalised label
 * beside those nulled ids — audit_log.actor_label exists so a departed
 * teacher's row stays legible, and after an erasure it is exactly the
 * identifying data that was supposed to go. Clearing it is the whole of what
 * this module adds to what the foreign keys already guarantee.
 */

/* ── Subject access ────────────────────────────────────────────────────── */

export type ExportBundle = {
  generatedAt: string;
  subject: { id: string; email: string | null; name: string | null };
  /** Table name to rows, so the shape is inspectable rather than curated. */
  data: Record<string, unknown[]>;
  notes: string[];
};

/**
 * Everything keyed to one person.
 *
 * Deliberately a dump of rows rather than a friendly summary. A subject
 * access request is answered with what is held, and a summary is an
 * interpretation — one that would quietly omit whatever the person writing it
 * did not think was interesting, which is the part a requester most often
 * wants.
 */
export async function exportPersonalData(userId: string): Promise<ExportBundle> {
  const user = await db
    .prepare(`SELECT id, email, name FROM users WHERE id = ?`)
    .get(userId);
  if (!user) throw new Error("No such person.");

  // Every table that carries this person's own data, with the column it is
  // keyed by. Institutional rows that merely record their actions are listed
  // separately below, because those are the institution's records rather than
  // the subject's.
  const OWNED: Array<[string, string]> = [
    ["homework", "userId"],
    ["subjects", "userId"],
    ["task_events", "userId"],
    ["academic_profile", "userId"],
    ["timetable", "userId"],
    ["user_settings", "userId"],
    ["dismissed_signals", "userId"],
    ["attachments", "userId"],
    ["group_members", "userId"],
    ["group_comments", "userId"],
    ["enrollments", "user_id"],
    ["organization_memberships", "user_id"],
    ["section_teachers", "user_id"],
    ["assignment_submissions", "user_id"],
  ];

  const data: Record<string, unknown[]> = {};
  for (const [table, column] of OWNED) {
    try {
      data[table] = await db
        .prepare(`SELECT * FROM "${table}" WHERE "${column}" = ?`)
        .all(userId);
    } catch {
      // A table that does not exist in this deployment is not an error; it is
      // a feature that was never enabled.
      data[table] = [];
    }
  }

  // Quiz answers hang off submissions rather than off the person directly.
  data.quiz_responses = await db
    .prepare(
      `SELECT r.* FROM quiz_responses r
         JOIN assignment_submissions s ON s.id = r.submission_id
        WHERE s.user_id = ?`
    )
    .all(userId);

  return {
    generatedAt: new Date().toISOString(),
    subject: {
      id: (user as any).id,
      email: (user as any).email ?? null,
      name: (user as any).name ?? null,
    },
    data,
    notes: [
      "This is every row Scholar holds that is keyed to you.",
      "Records of actions you took on other people's work — a mark you gave, " +
        "a file you uploaded to a course — belong to the institution rather " +
        "than to you, and are not included here.",
      "AI settings are excluded: the stored API key is encrypted and is a " +
        "credential rather than personal data.",
    ],
  };
}

/* ── Erasure ───────────────────────────────────────────────────────────── */

export type ErasurePreview = {
  /** Rows that will be deleted outright, by table. */
  deleting: Record<string, number>;
  /** Rows that will survive with the person's identity removed. */
  anonymising: Record<string, number>;
  /** Things the institution should decide about before proceeding. */
  warnings: string[];
};

const CASCADES: Array<[string, string]> = [
  ["homework", "userId"],
  ["subjects", "userId"],
  ["task_events", "userId"],
  ["academic_profile", "userId"],
  ["timetable", "userId"],
  ["user_settings", "userId"],
  ["dismissed_signals", "userId"],
  ["attachments", "userId"],
  ["group_members", "userId"],
  ["group_comments", "userId"],
  ["enrollments", "user_id"],
  ["organization_memberships", "user_id"],
  ["section_teachers", "user_id"],
  ["assignment_submissions", "user_id"],
  ["sessions", "userId"],
  ["accounts", "userId"],
];

const NULLIFIES: Array<[string, string]> = [
  ["audit_log", "actor_user_id"],
  ["grade_events", "actor_user_id"],
  ["assignment_submissions", "graded_by"],
  ["assignments", "created_by"],
  ["questions", "created_by"],
  ["files", "uploaded_by"],
  ["grade_drafts", "requested_by"],
  ["grade_drafts", "resolved_by"],
];

/**
 * What erasing this person would do, before doing it.
 *
 * Shown to whoever presses the button, because the consequences are not
 * symmetrical and some of them are irreversible in a way that matters. A
 * student's submitted coursework cascades away with them — which is what
 * Article 17 asks for and may also be something the institution is separately
 * obliged to retain. That conflict is real, jurisdiction-specific, and not
 * something this tool should resolve silently on an administrator's behalf.
 */
export async function previewErasure(userId: string): Promise<ErasurePreview> {
  const deleting: Record<string, number> = {};
  const anonymising: Record<string, number> = {};

  for (const [table, column] of CASCADES) {
    try {
      const r = await db
        .prepare(`SELECT COUNT(*)::int AS c FROM "${table}" WHERE "${column}" = ?`)
        .get(userId);
      const n = Number((r as any)?.c ?? 0);
      if (n > 0) deleting[table] = n;
    } catch {
      /* table absent in this deployment */
    }
  }

  for (const [table, column] of NULLIFIES) {
    try {
      const r = await db
        .prepare(`SELECT COUNT(*)::int AS c FROM "${table}" WHERE "${column}" = ?`)
        .get(userId);
      const n = Number((r as any)?.c ?? 0);
      if (n > 0) anonymising[table] = (anonymising[table] ?? 0) + n;
    } catch {
      /* table absent */
    }
  }

  const warnings: string[] = [];
  if (deleting.assignment_submissions) {
    warnings.push(
      `${deleting.assignment_submissions} pieces of submitted coursework will be ` +
        "deleted along with their marks. If your institution is required to retain " +
        "academic records, export them before erasing."
    );
  }
  if (anonymising.grade_events) {
    warnings.push(
      `${anonymising.grade_events} grade changes this person made will be kept, ` +
        "with their name removed. The record that a mark changed survives; who " +
        "changed it does not."
    );
  }
  if (deleting.section_teachers) {
    warnings.push(
      "This person currently teaches at least one class. Reassign it first, or " +
        "the class is left with no teacher."
    );
  }

  return { deleting, anonymising, warnings };
}

export type ErasureResult = {
  erasedAt: string;
  deleted: Record<string, number>;
  anonymised: Record<string, number>;
};

/**
 * Erase a person.
 *
 * Deleting the user row does almost all of it: the foreign keys were declared
 * so that owned data cascades and recorded actions are nulled. What has to be
 * done by hand is the denormalised label — audit_log.actor_label holds a name
 * precisely so a departed account leaves a legible row, and after an erasure
 * that is the identifying data the request was about.
 *
 * The preview is taken first and returned, so the answer to "what happened"
 * survives an operation that has by then made it unanswerable.
 */
export async function erasePerson(userId: string): Promise<ErasureResult> {
  const preview = await previewErasure(userId);

  // Before the row goes: the label beside every nulled id is the identity the
  // foreign keys cannot reach.
  await db
    .prepare(`UPDATE audit_log SET actor_label = '(erased)' WHERE actor_user_id = ?`)
    .run(userId);

  await db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);

  return {
    erasedAt: new Date().toISOString(),
    deleted: preview.deleting,
    anonymised: preview.anonymising,
  };
}
