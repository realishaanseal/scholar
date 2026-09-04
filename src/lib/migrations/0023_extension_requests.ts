/**
 * 0023 — extension requests.
 *
 * Scholar already works out that a student has 9.8 hours of work and 6 hours
 * to do it in. Until now that finding was shown to the student and stopped
 * there, which puts the whole burden of acting on it on the person least able
 * to: asking for an extension means an awkward conversation, and the students
 * who most need one are reliably the least likely to start it.
 *
 * This carries the arithmetic instead. A request records what Scholar
 * computed at the moment it was sent — hours of work outstanding, hours of
 * study time before the deadline — so the teacher receives evidence rather
 * than an assertion, and the student does not have to make the case.
 *
 * Three decisions are in the table rather than in a screen.
 *
 * The figures are snapshotted, not recomputed. A request read on Thursday must
 * show what was true on Tuesday when it was sent; a number that moves while
 * somebody decides on it is not evidence of anything. `work_mins` and
 * `available_mins` are written once and never updated.
 *
 * A decision is a row, not a deletion. `status` moves from 'pending' and the
 * request stays, with who decided and when, because "I asked and never heard
 * back" and "I was refused" are different complaints and a school needs to be
 * able to tell them apart.
 *
 * One open request per student per assignment. The unique partial index makes
 * repeat-asking impossible at the schema level rather than by a check somebody
 * has to remember, which matters because the alternative is a teacher opening
 * a queue with the same request in it eleven times.
 *
 * What is deliberately absent: any personal-layer detail. The request carries
 * two totals and a message the student typed. It does not carry their study
 * pattern, their pace, their other courses or what else they are behind on.
 * A teacher deciding on an extension needs to know the ask is real, not to be
 * handed a file on the person making it.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS extension_requests (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  assignment_id     text NOT NULL,
  student_user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What Scholar computed when this was sent. Never recalculated: a figure
  -- that drifts while a teacher considers it is not evidence.
  work_mins         integer NOT NULL,
  available_mins    integer NOT NULL,

  -- The student's own words. Optional, because the arithmetic is the point
  -- and requiring a paragraph reintroduces the barrier this exists to remove.
  message           text NOT NULL DEFAULT '',

  status            text NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Who answered, and when. Kept after the fact, so an unanswered request and
  -- a refused one are distinguishable.
  decided_by        text REFERENCES users(id) ON DELETE SET NULL,
  decided_at        timestamptz,
  decision_note     text NOT NULL DEFAULT '',

  CONSTRAINT extension_requests_status_known
    CHECK (status IN ('pending', 'granted', 'declined', 'withdrawn')),
  CONSTRAINT extension_requests_decided_together
    CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT extension_requests_minutes_sane
    CHECK (work_mins >= 0 AND available_mins >= 0),

  FOREIGN KEY (organization_id, assignment_id)
    REFERENCES assignments (organization_id, id) ON DELETE CASCADE
);

-- One open request per student per assignment. Enforced here rather than in a
-- handler, so a double-tapped button cannot produce two.
CREATE UNIQUE INDEX IF NOT EXISTS extension_requests_one_open
  ON extension_requests (assignment_id, student_user_id)
  WHERE status = 'pending';

-- The teacher's queue: everything still waiting, oldest first.
CREATE INDEX IF NOT EXISTS extension_requests_pending
  ON extension_requests (organization_id, status, created_at);

-- The student's own view of what they have asked for.
CREATE INDEX IF NOT EXISTS extension_requests_by_student
  ON extension_requests (student_user_id, created_at DESC);
`;
