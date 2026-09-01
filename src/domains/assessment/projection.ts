/**
 * Assignment → ScholarTask projection.
 *
 * The one place the institutional and personal halves of the product touch,
 * and the reason the whole architecture separates them.
 *
 * An assignment is authoritative for what the institution decided: the title,
 * the instructions, the deadline. A Scholar task is authoritative for what the
 * student decided: how long they think it will take, how they have prioritised
 * it, when they plan to start, and how much time they have actually logged.
 *
 * The guarantee that a sync never destroys personal planning is structural
 * rather than a rule someone has to remember: the UPDATE branch of the upsert
 * simply does not name the personal columns. It cannot overwrite what it does
 * not mention. `PERSONAL_COLUMNS` and the test that walks it exist so that
 * adding a column to the update clause has to be a deliberate act that fails
 * the build.
 */

export const EXTERNAL_SOURCE = "lms:assignment";

/**
 * Columns the institution owns. These are re-synced on every change, because
 * the teacher moving a deadline should move it on the student's task too.
 */
export const INSTITUTION_OWNED_COLUMNS = ["title", "details", "dueAt"] as const;

/**
 * Columns the student owns. A projection must never write these after the
 * first insert — that is the whole contract.
 *
 * `estimateMins` is the subtle one: the teacher's estimate seeds it when the
 * task is first created, and is then never allowed near it again. A student
 * who has learned that this course takes them longer than advertised must not
 * have that knowledge reset every time the teacher fixes a typo.
 */
export const PERSONAL_COLUMNS = [
  "estimateMins",
  "priority",
  "status",
  "focusSeconds",
  "startedAt",
  "actualMins",
  "completedAt",
  "subjectId",
  "aiNotes",
  "aiConfidence",
  "rawInput",
] as const;

/*
  A note on quoting. These identifiers are camelCase because the homework table
  is, and they are written UNQUOTED here on purpose: every runtime query passes
  through quoteCamelIdentifiers (see lib/sqlCase.ts), which wraps mixed-case
  tokens in double quotes on the way to Postgres. Quoting them by hand as well
  would produce ""userId"" and fail. New tables avoid the whole problem by
  being snake_case; this statement writes to a legacy one, so it plays by the
  legacy rules.
*/

/** The SET clause applied when the task already exists. Exported to be asserted on. */
export const UPSERT_UPDATE_CLAUSE = [
  "title = EXCLUDED.title",
  "details = EXCLUDED.details",
  "dueAt = EXCLUDED.dueAt",
  // Re-publishing a cancelled assignment brings its task back rather than
  // creating a second one.
  "archived_at = NULL",
  "updatedAt = EXCLUDED.updatedAt",
].join(",\n         ");

/**
 * Upsert one projected task.
 *
 * The conflict target repeats the partial index's predicate because
 * `idx_homework_external` is partial; without `WHERE externalId IS NOT NULL`
 * Postgres cannot match the statement to that index and the upsert fails.
 *
 * Personal columns appear only in the INSERT list, never in the update.
 */
export const UPSERT_TASK_SQL = `
INSERT INTO homework
  (id, userId, title, details, dueAt, subjectId, estimateMins,
   source, externalId, externalSource, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, 'lms', ?, '${EXTERNAL_SOURCE}', ?, ?)
ON CONFLICT (userId, externalSource, externalId) WHERE externalId IS NOT NULL
DO UPDATE SET
         ${UPSERT_UPDATE_CLAUSE}
`;

/**
 * Cancelling coursework archives the task rather than deleting it.
 *
 * The student may have logged real time against it, and that is a record of
 * work they genuinely did. Archiving hides it from the list without pretending
 * it never happened.
 */
export const ARCHIVE_TASK_SQL = `
UPDATE homework
   SET archived_at = ?, updatedAt = ?
 WHERE externalSource = '${EXTERNAL_SOURCE}' AND externalId = ? AND archived_at IS NULL
`;

/* ── Pure projection logic ─────────────────────────────────────────────── */

/** The minimum an assignment must expose to be projected. */
export type ProjectableAssignment = {
  id: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  status: string;
  estimatedMins: number | null;
  courseCode: string;
  courseTitle: string;
};

export type ProjectedFields = {
  title: string;
  details: string;
  dueAt: string | null;
  /** Seeded on insert only. */
  estimateMins: number | null;
  /** The course, used as the task's subject on insert only. */
  subject: string;
};

/**
 * What a task projected from this assignment should contain.
 *
 * Kept pure so the mapping can be asserted without a database — this is the
 * function that decides what a student actually sees on their dashboard.
 */
export function projectedFields(a: ProjectableAssignment): ProjectedFields {
  return {
    // The course code leads, because a student's task list is sorted by
    // urgency across every subject and "Problem set 4" alone is ambiguous once
    // three courses have one.
    title: `${a.courseCode} — ${a.title}`,
    details: a.instructions.trim(),
    dueAt: a.dueAt,
    estimateMins: a.estimatedMins,
    subject: a.courseTitle || a.courseCode,
  };
}

/**
 * Should this assignment produce tasks at all?
 *
 * Only published work does. A draft is the teacher still writing, and
 * projecting it would put homework on a student's dashboard that nobody has
 * decided to set yet.
 */
export function shouldProject(a: Pick<ProjectableAssignment, "status">): boolean {
  return a.status === "published";
}

/* ── Submission window ─────────────────────────────────────────────────── */

export type SubmissionWindow = {
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  latePolicy: "accept" | "penalise" | "reject";
};

export type SubmissionVerdict =
  | { accepted: true; late: boolean }
  | { accepted: false; reason: "not-open-yet" | "closed" | "late-rejected" };

/**
 * May work be submitted right now, and would it count as late?
 *
 * Late and closed are separate questions on purpose. A deadline that also
 * slams the door gives a teacher no way to accept late work at a penalty,
 * which is what most courses actually do.
 */
export function evaluateSubmission(w: SubmissionWindow, now: Date): SubmissionVerdict {
  const at = now.getTime();

  if (w.availableFrom && at < Date.parse(w.availableFrom)) {
    return { accepted: false, reason: "not-open-yet" };
  }
  if (w.closesAt && at > Date.parse(w.closesAt)) {
    return { accepted: false, reason: "closed" };
  }

  const late = Boolean(w.dueAt && at > Date.parse(w.dueAt));
  if (late && w.latePolicy === "reject") {
    return { accepted: false, reason: "late-rejected" };
  }
  return { accepted: true, late };
}
