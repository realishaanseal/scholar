/**
 * 0011 — where everyone is, and which days they do not work.
 *
 * Scholar has been assuming two things that are true in some countries and
 * false in others, and getting confidently wrong answers in the second group.
 *
 * The first is that everybody shares one clock. A deadline is stored as an
 * instant, which is right, but the *intent* behind it was never stored at all.
 * "Friday 23:59" set by a teacher in Mumbai and read by a student on exchange
 * in Berlin is 20:29 to the student, and until now nothing recorded which of
 * those two wall clocks the rule was written against. Both halves are needed:
 * the instant so the ordering is unambiguous, and the zone so the sentence can
 * be shown the way the teacher meant it.
 *
 * The second is that the weekend is Saturday and Sunday. In Egypt, Saudi
 * Arabia, the UAE, Jordan, Kuwait, Oman, Qatar and Israel it is not, and the
 * planner shipped in Phase 9 has been telling students in those countries to
 * start work on a day they are at school while allocating them study hours on
 * a day they are not. Rest days become data rather than an assumption.
 *
 * Columns here follow the convention of the table they join: organizations and
 * assignments are snake_case; academic_profile is one of the original
 * camelCase tables and keeps its house style rather than becoming the only row
 * in the schema that mixes both.
 */
export const sql = `
-- Where the institution is. IANA, not an offset: offsets change twice a year
-- in half the world and a stored "+05:30" is wrong for part of it.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- The institution's ordinary working week, as the default its students
-- inherit. Comma-separated day numbers, 0 = Sunday through 6 = Saturday.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS rest_days text NOT NULL DEFAULT '0,6';

-- The zone the deadline was authored against. Nullable, and null means "this
-- assignment predates the question" — read as the institution's zone, which
-- is what it would have meant anyway.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS due_timezone text;

-- A student's own zone and rest days, overriding the institution's. Null
-- timezone means "use the institution's" rather than "UTC": a student who has
-- never touched the setting is almost certainly where their school is.
ALTER TABLE academic_profile
  ADD COLUMN IF NOT EXISTS "timezone" text;

ALTER TABLE academic_profile
  ADD COLUMN IF NOT EXISTS "restDays" text;
`;
