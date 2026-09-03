/**
 * 0012 — real timestamps on the personal tables. Expand only.
 *
 * The original schema stored every date as TEXT, formatted to look like
 * Date.prototype.toISOString(). It reads back correctly and it is unusable for
 * anything else: no AT TIME ZONE, no interval arithmetic, no index that means
 * what an index on a date should mean. Phase 12 gave the institution a
 * timezone; the personal layer — where a student's own deadlines live — cannot
 * participate until its dates are dates.
 *
 * This migration adds parallel timestamptz columns and backfills them. It
 * changes nothing that is read, drops nothing, and is safe to roll back by
 * ignoring the new columns. The swap and the drop are separate releases, in
 * that order, because the Phase 0 audit said so and because a conversion that
 * silently shifts a deadline produces a student marked late for work they
 * handed in on time — which is not recoverable by fixing the bug afterwards.
 *
 * The cast is deliberately plain. Every value in these columns was written
 * either by the column default or by toISOString(), both of which carry an
 * explicit Z, so `::timestamptz` is unambiguous. Anything that was not is
 * caught by the verification script rather than assumed away: run
 * `npm run timestamps:verify` before the release that swaps reads, and do not
 * swap while it reports a single row that does not round-trip.
 *
 * Not covered here, on purpose:
 *
 *   sessions.expires, verification_tokens.expires, accounts.*
 *     Owned by the Auth.js adapter, which expects the shapes it defined.
 *     Changing them is a separate concern with a separate blast radius.
 *
 *   homework.archived_at
 *     Added by 0004 and already timestamptz. It was the one column in this
 *     table that got it right first time.
 *
 *   calendar_connections.*, calendar_links.*
 *     The external-calendar path was removed in 3983476. Converting columns
 *     belonging to a feature that no longer exists is work with no reader.
 */
export const sql = `
-- Personal coursework. The highest-stakes column in the schema is
-- homework."dueAt": it is a student's actual deadline, and every overdue
-- calculation compares against it.
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS due_at_tz       timestamptz,
  ADD COLUMN IF NOT EXISTS created_at_tz   timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at_tz   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at_tz timestamptz,
  ADD COLUMN IF NOT EXISTS started_at_tz   timestamptz;

UPDATE homework SET
  due_at_tz       = NULLIF("dueAt", '')::timestamptz,
  created_at_tz   = NULLIF("createdAt", '')::timestamptz,
  updated_at_tz   = NULLIF("updatedAt", '')::timestamptz,
  completed_at_tz = NULLIF("completedAt", '')::timestamptz,
  started_at_tz   = NULLIF("startedAt", '')::timestamptz
WHERE due_at_tz IS NULL AND created_at_tz IS NULL;

-- The completion log the learning loop reads.
ALTER TABLE task_events
  ADD COLUMN IF NOT EXISTS due_at_tz       timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at_tz timestamptz,
  ADD COLUMN IF NOT EXISTS created_at_tz   timestamptz;

UPDATE task_events SET
  due_at_tz       = NULLIF("dueAt", '')::timestamptz,
  completed_at_tz = NULLIF("completedAt", '')::timestamptz,
  created_at_tz   = NULLIF("createdAt", '')::timestamptz
WHERE created_at_tz IS NULL;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE subjects SET created_at_tz = NULLIF("createdAt", '')::timestamptz
 WHERE created_at_tz IS NULL;

ALTER TABLE timetable
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE timetable SET created_at_tz = NULLIF("createdAt", '')::timestamptz
 WHERE created_at_tz IS NULL;

ALTER TABLE academic_profile
  ADD COLUMN IF NOT EXISTS updated_at_tz timestamptz;
UPDATE academic_profile SET updated_at_tz = NULLIF("updatedAt", '')::timestamptz
 WHERE updated_at_tz IS NULL;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS updated_at_tz timestamptz;
UPDATE user_settings SET updated_at_tz = NULLIF("updatedAt", '')::timestamptz
 WHERE updated_at_tz IS NULL;

ALTER TABLE dismissed_signals
  ADD COLUMN IF NOT EXISTS dismissed_at_tz timestamptz;
UPDATE dismissed_signals SET dismissed_at_tz = NULLIF("dismissedAt", '')::timestamptz
 WHERE dismissed_at_tz IS NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE users SET created_at_tz = NULLIF("createdAt", '')::timestamptz
 WHERE created_at_tz IS NULL;

-- The sharing tier. Empty on every deployment so far, which makes this the
-- cheapest possible time to convert it.
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE groups SET created_at_tz = NULLIF("createdAt", '')::timestamptz
 WHERE created_at_tz IS NULL;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS joined_at_tz timestamptz;
UPDATE group_members SET joined_at_tz = NULLIF("joinedAt", '')::timestamptz
 WHERE joined_at_tz IS NULL;

ALTER TABLE group_tasks
  ADD COLUMN IF NOT EXISTS due_at_tz     timestamptz,
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE group_tasks SET
  due_at_tz     = NULLIF("dueAt", '')::timestamptz,
  created_at_tz = NULLIF("createdAt", '')::timestamptz
WHERE created_at_tz IS NULL;

ALTER TABLE group_comments
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz;
UPDATE group_comments SET created_at_tz = NULLIF("createdAt", '')::timestamptz
 WHERE created_at_tz IS NULL;

ALTER TABLE share_grants
  ADD COLUMN IF NOT EXISTS created_at_tz timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_tz timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at_tz timestamptz;
UPDATE share_grants SET
  created_at_tz = NULLIF("createdAt", '')::timestamptz,
  expires_at_tz = NULLIF("expiresAt", '')::timestamptz,
  revoked_at_tz = NULLIF("revokedAt", '')::timestamptz
WHERE created_at_tz IS NULL;

-- The indexes the swap will need, created now so the release that flips reads
-- is a code change rather than a code change plus a table scan.
CREATE INDEX IF NOT EXISTS idx_homework_due_at_tz ON homework(due_at_tz);
CREATE INDEX IF NOT EXISTS idx_task_events_completed_at_tz ON task_events(completed_at_tz);
`;
