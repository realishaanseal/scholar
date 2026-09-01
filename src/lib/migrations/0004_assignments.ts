/**
 * 0004 — assignments, submissions, and the hook the Scholar projection needs.
 *
 * This is the phase where the two halves of the product meet. An assignment is
 * an institutional object: the teacher owns its title, instructions, deadline
 * and points. The Scholar task projected from it is a personal object: the
 * student owns the estimate, the priority, the scheduling and the time logged
 * against it. They are related by id, never merged.
 *
 * The only change to an existing table is one nullable column on homework.
 * homework.archived_at is snake_case deliberately, even though its neighbours
 * are camelCase: that table is mid-transition, and new columns follow the
 * convention the timestamptz migration will eventually normalise the rest to.
 * Adding another camelCase column would mean opting this migration into the
 * regex quoting shim, which is exactly what that shim is being contained away
 * from.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS assignments (
  id                 text PRIMARY KEY,
  organization_id    text NOT NULL,
  course_section_id  text NOT NULL,
  -- Nullable so deleting a staff account never destroys the coursework they
  -- set; the assignment belongs to the institution, not to the author.
  created_by         text REFERENCES users(id) ON DELETE SET NULL,
  title              text NOT NULL,
  instructions       text NOT NULL DEFAULT '',
  points             numeric(6,2),
  available_from     timestamptz,
  due_at             timestamptz,
  -- The hard cutoff. Distinct from due_at: work can be late but still accepted
  -- until this passes, which is what makes a late policy expressible at all.
  closes_at          timestamptz,
  submission_type    text NOT NULL DEFAULT 'text',
  max_attempts       integer,
  -- accept | penalise | reject
  late_policy        text NOT NULL DEFAULT 'accept',
  -- draft | published | archived. Students never see a draft.
  status             text NOT NULL DEFAULT 'draft',
  published_at       timestamptz,
  -- The teacher's estimate. Seeds a student's personal estimate on first
  -- projection and is never written over it again.
  estimated_mins     integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT assignments_window_ordered
    CHECK (available_from IS NULL OR due_at IS NULL OR due_at >= available_from),
  CONSTRAINT assignments_close_after_due
    CHECK (closes_at IS NULL OR due_at IS NULL OR closes_at >= due_at),
  CONSTRAINT assignments_points_nonnegative CHECK (points IS NULL OR points >= 0),
  CONSTRAINT assignments_attempts_positive CHECK (max_attempts IS NULL OR max_attempts > 0)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  assignment_id    text NOT NULL,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt          integer NOT NULL DEFAULT 1,
  -- draft | submitted | returned
  status           text NOT NULL DEFAULT 'draft',
  body             text NOT NULL DEFAULT '',
  url              text,
  submitted_at     timestamptz,
  -- Recorded at submission time rather than derived later, because the
  -- deadline can move afterwards and lateness is a fact about when the work
  -- actually arrived.
  is_late          boolean NOT NULL DEFAULT false,
  score            numeric(6,2),
  feedback         text NOT NULL DEFAULT '',
  graded_at        timestamptz,
  graded_by        text REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id, attempt),
  FOREIGN KEY (organization_id, assignment_id)
    REFERENCES assignments (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT submissions_attempt_positive CHECK (attempt > 0),
  CONSTRAINT submissions_score_nonnegative CHECK (score IS NULL OR score >= 0)
);

/*
  Cancelling an assignment must not delete the student's task: they may have
  logged real time against it, and erasing that would erase a record of work
  actually done. The task is archived instead, and the existing task list
  filters archived rows out.
*/
ALTER TABLE homework ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assignments_section
  ON assignments (course_section_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_assignments_due
  ON assignments (organization_id, due_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_submissions_assignment
  ON assignment_submissions (assignment_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_user
  ON assignment_submissions (user_id, assignment_id);
-- The task list reads this on every dashboard load.
CREATE INDEX IF NOT EXISTS idx_homework_archived ON homework (archived_at);
`;
