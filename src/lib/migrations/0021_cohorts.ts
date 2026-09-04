/**
 * 0021 — cohorts.
 *
 * Invitations solved onboarding a class of thirty. They do not solve a school:
 * Year 9 into eleven courses is eleven manual rosters, and they drift apart
 * the first time somebody transfers in.
 *
 * The Moodle model, which is the right one. A cohort is a named group of
 * people that exists independently of any course. Linking it to a section
 * enrols its members, and — this is the part that matters — the link persists,
 * so somebody added to Year 9 in March lands in all eleven courses without
 * anybody remembering to do it.
 *
 * Sync is one-directional on purpose. Adding somebody to a cohort enrols them;
 * removing them from a cohort does *not* unenrol them. A student who leaves a
 * tutor group mid-year has still done the work in those courses, and their
 * submissions, marks and grade history belong to them. Withdrawing a
 * membership must stay an explicit act with somebody's name on it, not a side
 * effect of tidying a list.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS cohorts (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  created_by       text REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  -- One "Year 9" per school. A second is a typo, not a second year group.
  UNIQUE (organization_id, name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cohort_members (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  cohort_id        text NOT NULL,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, user_id),
  FOREIGN KEY (organization_id, cohort_id)
    REFERENCES cohorts (organization_id, id) ON DELETE CASCADE
);

/*
  The standing link between a cohort and a class.

  Kept rather than being a one-off action, because that is the whole
  difference between "enrol these thirty now" and "this class is Year 9". The
  second survives a transfer in March.
*/
CREATE TABLE IF NOT EXISTS cohort_sections (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  cohort_id         text NOT NULL,
  course_section_id text NOT NULL,
  linked_by         text REFERENCES users(id) ON DELETE SET NULL,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, course_section_id),
  FOREIGN KEY (organization_id, cohort_id)
    REFERENCES cohorts (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_sections_cohort ON cohort_sections(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_sections_section ON cohort_sections(course_section_id);

/*
  An invitation can name a cohort as well as a section, so inviting a year
  group and building every one of its rosters is one action.
*/
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS cohort_id text;
`;
