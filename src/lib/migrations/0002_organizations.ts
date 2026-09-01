/**
 * 0002 — organizations and academic structure.
 *
 * The first institutional tables. Purely additive: nothing here touches an
 * existing table, so an independent user's Scholar is unaffected and the
 * migration is reversible by dropping what it creates.
 *
 * Three conventions differ deliberately from the baseline, and every migration
 * after this one should follow these rather than 0001:
 *
 *   snake_case columns   — so the camelCase quoting shim never has to run over
 *                          this SQL. That shim rewrites identifiers by regex
 *                          and cannot tell an identifier from mixed-case text
 *                          inside a string literal.
 *   timestamptz          — not TEXT. An institution's timezone and a user's
 *                          are separate concepts, and comparing them needs the
 *                          database to actually know what an instant is.
 *   date for calendar days — a term starts on a date, not at an instant. Storing
 *                          it as a timestamp invites an off-by-one every time
 *                          it crosses a timezone.
 */
export const sql = `
-- An institution. A user may belong to several, or to none at all: personal
-- Scholar continues to work with no organization, which is why nothing here
-- is referenced by the existing personal tables.
CREATE TABLE IF NOT EXISTS organizations (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  -- The institution's own timezone, separate from any user's. Deadlines are
  -- set in this one and displayed in the reader's.
  timezone    text NOT NULL DEFAULT 'UTC',
  locale      text NOT NULL DEFAULT 'en',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  code             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

/*
  Membership is the join between a person and an institution, and it carries
  the role. The role deliberately lives here rather than on users: a teacher at
  one institution may be a student at another, so a single global role column
  could not describe them.

  No CHECK constraint pins the role to today's eight values. Custom
  institution-defined roles are a stated goal, and a CHECK would make every new
  role a schema migration. The RoleId union and the service layer validate it;
  the database stores it.
*/
CREATE TABLE IF NOT EXISTS organization_memberships (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             text NOT NULL,
  -- Set for a department-scoped role; null for organization-wide ones.
  department_id    text REFERENCES departments(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One row per role held, so holding two roles in one institution is
  -- representable rather than something the application has to encode.
  UNIQUE (organization_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS academic_years (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  starts_on        date NOT NULL,
  ends_on          date NOT NULL,
  is_current       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  CONSTRAINT academic_years_dates_ordered CHECK (ends_on > starts_on)
);

CREATE TABLE IF NOT EXISTS terms (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  academic_year_id  text NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name              text NOT NULL,
  starts_on         date NOT NULL,
  ends_on           date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, name),
  CONSTRAINT terms_dates_ordered CHECK (ends_on > starts_on)
);

CREATE TABLE IF NOT EXISTS programs (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id    text REFERENCES departments(id) ON DELETE SET NULL,
  name             text NOT NULL,
  code             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- At most one current year per institution. Enforced here rather than in the
-- application, because "which year is it" is read on nearly every request and
-- two of them would be silently wrong everywhere rather than loudly wrong once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_one_current
  ON academic_years (organization_id) WHERE is_current;

-- Resolving an actor reads every membership for one user on each request, so
-- this index is on the hot path for authorization.
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org  ON organization_memberships (organization_id, role);
CREATE INDEX IF NOT EXISTS idx_departments_org  ON departments (organization_id);
CREATE INDEX IF NOT EXISTS idx_terms_year       ON terms (academic_year_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_programs_org     ON programs (organization_id);
`;
