/**
 * 0008 — quizzes, and the question bank behind them.
 *
 * A quiz is not a new kind of coursework. It is an assignment whose submission
 * happens to be produced by answering questions instead of typing prose or
 * attaching a file. Modelling it that way rather than as a parallel table means
 * the deadline logic, the attempt limits, the late policy, the gradebook, the
 * marking queue and the projection into a student's personal task list all keep
 * working with no change at all — none of that is reimplemented here, which is
 * the entire reason for the decision.
 *
 * Questions belong to a COURSE, not to a quiz. That is what makes the bank a
 * bank: the same question can appear on this term's test and next term's, and
 * editing it in one place is the point. quiz_questions is the ordered selection
 * a particular quiz makes from that pool.
 *
 * The one genuinely dangerous column here is questions.spec, which holds the
 * correct answers. It must never reach a student's browser before they submit.
 * That is enforced in one redaction function with a test asserting the student
 * route cannot return it — the same shape of protection as the file download
 * route, and for the same reason: an unguessable field that is nonetheless
 * present in a payload is not protected, it is merely undiscovered.
 */
export const sql = `
-- What kind of thing this assignment is. Existing rows are tasks, which is
-- what they have always been.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';

CREATE TABLE IF NOT EXISTS questions (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  course_id        text NOT NULL,
  -- choice | multi | short | open
  kind             text NOT NULL,
  prompt           text NOT NULL,
  points           numeric(6,2) NOT NULL DEFAULT 1,
  -- The complete definition, correct answers included. Never serialised to a
  -- student unredacted. Shapes, by kind:
  --   choice { options: [{ id, body, correct }] }
  --   multi  { options: [{ id, body, correct }] }
  --   short  { accept: [{ text, mode: 'exact' | 'ci' }] }
  --   open   { guidance?: text }
  spec             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Shown to the student once their attempt has been marked, never before.
  explanation      text NOT NULL DEFAULT '',
  -- Nullable for the same reason assignments.created_by is: the question
  -- belongs to the course, and a teacher leaving must not delete the bank.
  created_by       text REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT questions_kind_known
    CHECK (kind IN ('choice', 'multi', 'short', 'open')),
  CONSTRAINT questions_points_nonnegative CHECK (points >= 0)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  assignment_id    text NOT NULL,
  question_id      text NOT NULL,
  position         integer NOT NULL DEFAULT 0,
  -- Lets one question be worth more on a final than on a practice quiz
  -- without forking the question itself. Null means use the question's own.
  points           numeric(6,2),
  UNIQUE (assignment_id, question_id),
  FOREIGN KEY (organization_id, assignment_id)
    REFERENCES assignments (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, question_id)
    REFERENCES questions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT quiz_questions_points_nonnegative CHECK (points IS NULL OR points >= 0)
);

CREATE TABLE IF NOT EXISTS quiz_responses (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  submission_id    text NOT NULL,
  question_id      text NOT NULL,
  -- What they picked or typed: { optionIds: [...] } or { text: "..." }
  response         jsonb NOT NULL DEFAULT '{}'::jsonb,
  awarded          numeric(6,2),
  -- True while a human still has to look at this one. An open question is
  -- born needing review; an auto-marked one never does.
  needs_review     boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id),
  FOREIGN KEY (organization_id, submission_id)
    REFERENCES assignment_submissions (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, question_id)
    REFERENCES questions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT quiz_responses_awarded_nonnegative CHECK (awarded IS NULL OR awarded >= 0)
);

CREATE INDEX IF NOT EXISTS idx_questions_course
  ON questions(course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_assignment
  ON quiz_questions(assignment_id, position);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_submission
  ON quiz_responses(submission_id);
`;
