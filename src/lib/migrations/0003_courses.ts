/**
 * 0003 — courses, sections, enrollment and module content.
 *
 * This is what makes authorization bite. Until now a TEACHER membership
 * granted a role but reached no section, so every course-bound permission was
 * denied; `section_teachers` and `enrollments` are the rows that finally
 * answer "which sections?".
 *
 * Every child table carries `organization_id` alongside its parent key, and
 * the foreign key is composite — (organization_id, course_id) rather than
 * (course_id). That is not denormalisation for speed: it makes it structurally
 * impossible to attach a section in one institution to a course in another.
 * A tenant boundary enforced only by application code is one forgotten WHERE
 * clause away from leaking, and the authorization tests already showed that
 * comparing the organization is what stops an id collision across tenants
 * granting access.
 *
 * Deliberately NOT included: a resources table. Course materials are files,
 * and the file layer still stores bytes as base64 inside a row. Adding a
 * resources table now would either duplicate that mistake or be a table with
 * nowhere to put its content, so it waits for object storage.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS courses (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id    text REFERENCES departments(id) ON DELETE SET NULL,
  code             text NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  credits          numeric(4,1),
  -- draft until deliberately published; students never see a draft course.
  status           text NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  -- The target of the composite foreign keys below.
  UNIQUE (organization_id, id)
);

/*
  One offering of a course in one term. Assignments, enrollment and grading all
  hang off the section rather than the course, because "Physics 101" spans
  years while "Physics 101, Section A, Autumn 2026" is the thing a particular
  student is actually in.
*/
CREATE TABLE IF NOT EXISTS course_sections (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  course_id        text NOT NULL,
  term_id          text NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  capacity         integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, term_id, name),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE
);

-- Who teaches a section. Separate from organization_memberships because
-- "is a teacher here" and "teaches this section" are different facts, and
-- conflating them is exactly how a role becomes global by accident.
CREATE TABLE IF NOT EXISTS section_teachers (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  course_section_id text NOT NULL,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- TEACHER or TEACHING_ASSISTANT; the assistant grades but cannot publish.
  role              text NOT NULL DEFAULT 'TEACHER',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_section_id, user_id),
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enrollments (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  course_section_id text NOT NULL,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- active | dropped | completed. Dropping keeps the row so a transcript and
  -- any submitted work survive; deleting it would erase both.
  status            text NOT NULL DEFAULT 'active',
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_section_id, user_id),
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE
);

/*
  Module content hangs off the course, not the section: the syllabus is the
  same for every section of Physics 101, while the schedule is not.

  The position column has no unique constraint on purpose. Ordering is
  (position, created_at), so reordering is a plain UPDATE rather than a dance
  around a unique index with temporary values.
*/
CREATE TABLE IF NOT EXISTS modules (
  id                      text PRIMARY KEY,
  organization_id         text NOT NULL,
  course_id               text NOT NULL,
  title                   text NOT NULL,
  summary                 text NOT NULL DEFAULT '',
  position                integer NOT NULL DEFAULT 0,
  is_published            boolean NOT NULL DEFAULT false,
  -- Gating: this module opens only once the prerequisite is complete.
  prerequisite_module_id  text REFERENCES modules(id) ON DELETE SET NULL,
  estimated_mins          integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT modules_not_own_prerequisite CHECK (prerequisite_module_id IS NULL OR prerequisite_module_id <> id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  module_id        text NOT NULL,
  title            text NOT NULL,
  -- lecture | reading | video | practice | link
  kind             text NOT NULL DEFAULT 'lecture',
  body             text NOT NULL DEFAULT '',
  url              text,
  position         integer NOT NULL DEFAULT 0,
  is_published     boolean NOT NULL DEFAULT false,
  estimated_mins   integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, module_id)
    REFERENCES modules (organization_id, id) ON DELETE CASCADE
);

-- Resolving an actor reads these two on every request, keyed by user.
CREATE INDEX IF NOT EXISTS idx_section_teachers_user ON section_teachers (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user      ON enrollments (user_id, status);

CREATE INDEX IF NOT EXISTS idx_sections_course       ON course_sections (course_id, term_id);
CREATE INDEX IF NOT EXISTS idx_sections_term         ON course_sections (term_id);
CREATE INDEX IF NOT EXISTS idx_courses_org_status    ON courses (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_section   ON enrollments (course_section_id, status);
CREATE INDEX IF NOT EXISTS idx_modules_course        ON modules (course_id, position);
CREATE INDEX IF NOT EXISTS idx_lessons_module        ON lessons (module_id, position);
`;
