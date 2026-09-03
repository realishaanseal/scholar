/**
 * 0010 — the two things an institution has to have before it can deploy this.
 *
 * An audit log, because an organisation holding minors' coursework must be
 * able to answer "who saw this, and when" — to a parent, to a safeguarding
 * lead, or to a regulator — and an answer that depends on the server's console
 * buffer still existing is not an answer.
 *
 * Rate limits, because every route here is one script away from being called
 * ten thousand times, and two of them cost real money per call.
 *
 * What the audit log deliberately does not record is ordinary reading. A row
 * per page view would be a surveillance system in its own right, and one built
 * accidentally out of a compliance requirement. What is recorded is
 * consequential: things that changed, things that were refused, and the small
 * number of reads that are themselves sensitive — someone opening a
 * student's submitted work.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS audit_log (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  -- Nullable so a departing member's account can be removed without erasing
  -- the record that something was done. The same reasoning as grade_events:
  -- the trail outlives the person, or it is not a trail.
  actor_user_id    text REFERENCES users(id) ON DELETE SET NULL,
  -- Kept alongside the id so a deleted account still leaves a legible row
  -- rather than an anonymous one.
  actor_label      text NOT NULL DEFAULT '',
  -- Verb, in the same vocabulary as the permission catalogue where possible:
  -- 'assignment:publish', 'submission:grade', 'file:download', 'authz:denied'.
  action           text NOT NULL,
  -- What it was done to.
  subject_type     text NOT NULL DEFAULT '',
  subject_id       text,
  -- Anything else worth keeping. Deliberately free-form and deliberately
  -- small: this is not a place to copy a student's work into.
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE
);

-- The three questions actually asked of an audit log: what happened here
-- lately, what has this person done, and what has been done to this thing.
CREATE INDEX IF NOT EXISTS idx_audit_org_time
  ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subject
  ON audit_log(subject_type, subject_id, created_at DESC);

/*
  Rate limiting, in Postgres.

  Not Redis, because adding a second datastore to solve a problem this size
  would be a worse trade than the one it fixes, and this application already
  has a database it trusts. A fixed window rather than a sliding one: the
  known cost is that a caller can spend a full allowance at the end of one
  window and another at the start of the next, and for the things being
  guarded here — paid model calls, uploads — being briefly wrong by a factor
  of two is acceptable in a way that carrying a second service is not.
*/
CREATE TABLE IF NOT EXISTS rate_limits (
  -- '<bucket>:<subject>', e.g. 'ai-draft:<userId>'.
  key              text PRIMARY KEY,
  count            integer NOT NULL DEFAULT 0,
  -- Start of the window this count belongs to. A request arriving after the
  -- window has elapsed resets rather than queues.
  window_start     timestamptz NOT NULL DEFAULT now()
);

-- Lets exhausted windows be swept without scanning the table.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON rate_limits(window_start);
`;
