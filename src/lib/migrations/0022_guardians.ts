/**
 * 0022 — guardians.
 *
 * A K-12 school will not buy without it, and it is the most sensitive object
 * in this product. A guardian link is a claim about a family, made by a
 * school, about a child. Getting it wrong means showing one family another
 * family's data, and there is no version of that which is recoverable by an
 * apology.
 *
 * Four decisions are written into this table rather than left to a screen:
 *
 * The school asserts the relationship. There is no self-service path where an
 * adult claims to be somebody's parent — `added_by` is not nullable in
 * practice and every row is created by a member of staff acting in their
 * institution. An email address proves control of an inbox, which is not the
 * same as being a child's guardian.
 *
 * Revoked rather than deleted. Family arrangements change, sometimes for
 * reasons a court has decided, and a school needs to be able to say when
 * access ended and who ended it. A deleted row cannot answer that.
 *
 * Scoped to an institution. A guardian at one school is not a guardian at
 * another, and the same two people can have a relationship one school knows
 * about and another does not.
 *
 * And the child can see it. `guardian_links` is readable by the student it
 * concerns, because somebody is entitled to know who is reading about them.
 * That is not a feature request, it is the reason the table has no hidden
 * flag on it.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS guardian_links (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  guardian_user_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- "Mother", "Father", "Carer", "Grandparent". Free text because family
  -- shapes are not an enum and a school knows better than this schema does.
  relationship      text NOT NULL DEFAULT '',
  -- The member of staff who asserted this. A link with nobody behind it is a
  -- claim nobody made.
  added_by          text REFERENCES users(id) ON DELETE SET NULL,
  added_by_label    text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Ended rather than removed, so a school can say when and by whom.
  revoked_at        timestamptz,
  revoked_by        text REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, guardian_user_id, student_user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  -- A person cannot be their own guardian, which is the sort of thing that
  -- only happens through a bug and should fail loudly when it does.
  CONSTRAINT guardian_not_self CHECK (guardian_user_id <> student_user_id)
);

-- The lookup that runs when a guardian signs in.
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian
  ON guardian_links(guardian_user_id) WHERE revoked_at IS NULL;

-- And the one a student runs to see who can read about them.
CREATE INDEX IF NOT EXISTS idx_guardian_links_student
  ON guardian_links(student_user_id) WHERE revoked_at IS NULL;
`;
