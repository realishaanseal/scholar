/**
 * 0017 — rubrics.
 *
 * The only shared vocabulary a teacher, a student and a moderator have about
 * why a mark is the mark. Every competitor has had them for years; Scholar
 * has been asking teachers to justify a number with a paragraph.
 *
 * Three tables rather than one because a rubric is genuinely three things: a
 * reusable document, the criteria it judges on, and the levels each criterion
 * can be met at. Flattening them into a JSON blob would make the common
 * operations — reuse this rubric, change one level's wording, report on how a
 * cohort did against one criterion — into string surgery.
 *
 * A rubric belongs to the institution and optionally to a course. Institution
 * scope is what makes "the department's essay rubric" possible; course scope
 * is what stops a physics rubric cluttering an English teacher's list. Both
 * are useful and neither is a default worth forcing.
 *
 * The link to an assignment carries whether the rubric decides the score.
 * Canvas learned to make this explicit and it is right: sometimes a rubric is
 * the mark, and sometimes it is the explanation of a mark the teacher gives
 * for other reasons. Guessing produces a gradebook nobody trusts.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS rubrics (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  -- Null means the whole institution can use it.
  course_id        text,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  created_by       text REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  rubric_id        text NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  -- What this criterion is worth at its best level. Denormalised from the
  -- levels so a criterion with no levels — a free-scored one — still has a
  -- ceiling.
  points           numeric(6,2) NOT NULL DEFAULT 0,
  position         integer NOT NULL DEFAULT 0,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, rubric_id)
    REFERENCES rubrics (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT rubric_criteria_points_nonnegative CHECK (points >= 0)
);

CREATE TABLE IF NOT EXISTS rubric_levels (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  criterion_id     text NOT NULL,
  -- "Excellent", "Meets expectations", "Not yet".
  label            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  points           numeric(6,2) NOT NULL DEFAULT 0,
  position         integer NOT NULL DEFAULT 0,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, criterion_id)
    REFERENCES rubric_criteria (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT rubric_levels_points_nonnegative CHECK (points >= 0)
);

-- Which rubric an assignment is marked against.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS rubric_id text;

-- Whether filling the rubric in sets the score, or merely explains one the
-- teacher enters separately.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS rubric_scores boolean NOT NULL DEFAULT true;

/*
  One row per criterion per submission: what the marker decided, and why.

  Not a JSON column on the submission. A department asking "how did Year 10 do
  on 'use of evidence' this term" is the question a rubric exists to answer,
  and it should be a GROUP BY rather than a scan that parses every blob.
*/
CREATE TABLE IF NOT EXISTS rubric_marks (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  submission_id    text NOT NULL,
  criterion_id     text NOT NULL,
  -- The level chosen, when one was. Null for a free-typed score.
  level_id         text,
  points           numeric(6,2),
  comment          text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, criterion_id),
  FOREIGN KEY (organization_id, submission_id)
    REFERENCES assignment_submissions (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, criterion_id)
    REFERENCES rubric_criteria (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT rubric_marks_points_nonnegative CHECK (points IS NULL OR points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rubrics_course ON rubrics(course_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rubric_criteria_rubric ON rubric_criteria(rubric_id, position);
CREATE INDEX IF NOT EXISTS idx_rubric_levels_criterion ON rubric_levels(criterion_id, position);
CREATE INDEX IF NOT EXISTS idx_rubric_marks_submission ON rubric_marks(submission_id);
-- The cross-cohort question: one criterion, everyone who was marked on it.
CREATE INDEX IF NOT EXISTS idx_rubric_marks_criterion ON rubric_marks(criterion_id);
`;
