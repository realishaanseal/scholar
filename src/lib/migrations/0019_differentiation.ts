/**
 * 0019 — work set for some students rather than all of them.
 *
 * Extensions, resits, differentiated tasks, access arrangements. Every one of
 * them is currently impossible: an assignment is for the whole section or for
 * nobody, so a teacher giving one student until Friday has to create a
 * duplicate assignment — which then appears in the gradebook as a second
 * column that everybody else is missing.
 *
 * The rule is deliberately "empty means everyone". A table with no rows for an
 * assignment is the normal case and should cost nothing to express; only the
 * exception is written down. That also means every assignment that already
 * exists keeps working without a backfill.
 *
 * The consequence that matters is in the gradebook rather than here. Work a
 * student was never set must not count against them — not as missing, not as
 * a zero, not as an empty cell that drags a percentage down. That is a change
 * to the arithmetic, not a filter on a list, and it is the reason this is a
 * migration rather than a UI feature.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS assignment_assignees (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  assignment_id    text NOT NULL,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Why this student and not the others. Shown to nobody but the staff who
  -- can already see the assignment; it exists so a colleague picking up a
  -- class in March can tell an extension from an oversight.
  reason           text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id),
  FOREIGN KEY (organization_id, assignment_id)
    REFERENCES assignments (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_assignees_assignment
  ON assignment_assignees(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_assignees_user
  ON assignment_assignees(user_id);
`;
