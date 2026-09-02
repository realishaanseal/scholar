/**
 * 0007 — the gradebook: categories, weighting, and a trail of who changed what.
 *
 * Marking already produced scores. They did not add up to anything: no course
 * total, no sense that a problem set counts for less than an exam, and no
 * record of a grade having been changed. This adds all three.
 *
 * The audit table is the part that matters most. A grade is the highest-stakes
 * thing this system holds — it is contestable, it is appealed, and it outlives
 * everyone's memory of the afternoon it was entered. "Who gave me this and
 * when did it change" has to be answerable from the data rather than from
 * whoever still works here.
 *
 * It is also how the rule that AI never silently finalises a grade is made
 * checkable rather than merely stated: every row names the person accountable,
 * and records separately whether a model drafted what they approved.
 */
export const sql = `
/*
  How a course weights its work. Optional: a course with no categories simply
  totals its points, which is what most courses actually do. Adding a category
  is how a teacher says an exam is worth more than a worksheet.
*/
CREATE TABLE IF NOT EXISTS grade_categories (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  course_id        text NOT NULL,
  name             text NOT NULL,
  -- Percentage of the final grade. Weights across a course should total 100,
  -- but that is not enforced here: a teacher part-way through setting them up
  -- would otherwise be blocked by a constraint on a state they are passing
  -- through. The interface reports the shortfall instead.
  weight           numeric(5,2) NOT NULL DEFAULT 0,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, name),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT grade_categories_weight_range CHECK (weight >= 0 AND weight <= 100)
);

-- Deleting a category must not delete the coursework in it; the work simply
-- becomes uncategorised and counts on points alone.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS grade_category_id text
  REFERENCES grade_categories(id) ON DELETE SET NULL;

/*
  The tenant-safe foreign key below needs its target to be unique. Migration
  0004 gave assignment_submissions a primary key on id alone, so the pair is
  added here as a unique index rather than a constraint — Postgres accepts an
  index as a foreign key target, and ADD CONSTRAINT has no IF NOT EXISTS,
  which a migration that must be safe to re-run cannot do without.
*/
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_org_id
  ON assignment_submissions (organization_id, id);

/*
  Every change to a mark, ever.

  Append-only by intent: nothing updates or deletes from this table, so the
  history of a contested grade cannot be tidied away by the person being
  contested. Scores are recorded before and after, because "changed to 62" is
  only half a story.
*/
CREATE TABLE IF NOT EXISTS grade_events (
  id                 text PRIMARY KEY,
  organization_id    text NOT NULL,
  submission_id      text NOT NULL,
  -- Nullable so a departed teacher's account can be removed without erasing
  -- the record that they marked this. The row keeps the fact; only the link
  -- to a live account goes.
  actor_user_id      text REFERENCES users(id) ON DELETE SET NULL,
  -- graded | regraded | cleared
  action             text NOT NULL,
  previous_score     numeric(6,2),
  new_score          numeric(6,2),
  previous_feedback  text,
  new_feedback       text,
  /*
    Set when a model drafted the mark that a person then approved. Null means
    a human wrote it unaided. This column is the difference between "AI helped
    mark this" being a claim and being a fact anyone can check — and there is
    no code path that writes a score without an actor_user_id beside it.
  */
  ai_model           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, submission_id)
    REFERENCES assignment_submissions (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grade_categories_course
  ON grade_categories (course_id, position);
CREATE INDEX IF NOT EXISTS idx_assignments_category
  ON assignments (grade_category_id) WHERE grade_category_id IS NOT NULL;
-- The history of one mark, newest first: what an appeal actually reads.
CREATE INDEX IF NOT EXISTS idx_grade_events_submission
  ON grade_events (submission_id, created_at DESC);
`;
