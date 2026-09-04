import { db, newId } from "@/lib/db";
import { DEFAULT_SCHEME_ID, SCHEMES } from "@/domains/grading/schemes";
import { decodeCursor, pageSize, toPage, type Page } from "@/lib/pagination";
import type { Actor } from "@/lib/authz";
import { toActor, type EnrollmentRow, type MembershipRow, type TeachingRow } from "./actor";
import type {
  AcademicYear, AcademicYearInput, AddMemberInput, CreateOrganizationInput,
  Department, Organization, OrganizationMembership, Term, TermInput,
} from "./types";

/**
 * Data access for the identity domain.
 *
 * Columns are snake_case here (see migration 0002) and mapped explicitly to
 * camelCase DTOs rather than aliased in SQL. The mapping is a few more lines
 * but it keeps the camelCase quoting shim — which rewrites identifiers by
 * regex — away from any query written from now on.
 */

/* ── Organizations ─────────────────────────────────────────────────────── */

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO organizations (id, name, slug, timezone, locale)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, input.name, input.slug, input.timezone, input.locale);
  const org = await getOrganization(id);
  if (!org) throw new Error("Organization was created but could not be read back.");
  return org;
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const row = await db
    .prepare(
      `SELECT id, name, slug, timezone, locale, created_at
       FROM organizations WHERE id = ?`
    )
    .get(id);
  return row ? mapOrganization(row) : null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const row = await db
    .prepare(
      `SELECT id, name, slug, timezone, locale, created_at
       FROM organizations WHERE slug = ?`
    )
    .get(slug);
  return row ? mapOrganization(row) : null;
}

function mapOrganization(r: any): Organization {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    timezone: r.timezone,
    locale: r.locale,
    createdAt: toISO(r.created_at),
  };
}

/* ── Membership ────────────────────────────────────────────────────────── */

export async function addMember(
  organizationId: string,
  input: AddMemberInput
): Promise<OrganizationMembership> {
  const id = newId();
  // A person may legitimately hold two roles in one institution, so the
  // conflict target is the whole (org, user, role) triple. Re-adding an
  // existing role reactivates it rather than failing, which is what an admin
  // re-inviting a suspended member expects to happen.
  await db
    .prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, department_id, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT (organization_id, user_id, role)
       DO UPDATE SET status = 'active', department_id = EXCLUDED.department_id`
    )
    .run(id, organizationId, input.userId, input.role, input.departmentId);

  const row = await db
    .prepare(
      `SELECT id, organization_id, user_id, role, department_id, status, created_at
       FROM organization_memberships
       WHERE organization_id = ? AND user_id = ? AND role = ?`
    )
    .get(organizationId, input.userId, input.role);
  return mapMembership(row);
}

/** Suspend rather than delete: revoking access should leave an auditable trace. */
export async function suspendMember(
  organizationId: string,
  userId: string,
  role: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE organization_memberships SET status = 'suspended'
       WHERE organization_id = ? AND user_id = ? AND role = ?`
    )
    .run(organizationId, userId, role);
}

export async function listMembers(organizationId: string): Promise<OrganizationMembership[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, user_id, role, department_id, status, created_at
       FROM organization_memberships
       WHERE organization_id = ?
       ORDER BY created_at`
    )
    .all(organizationId);
  return rows.map(mapMembership);
}

function mapMembership(r: any): OrganizationMembership {
  return {
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    role: r.role,
    departmentId: r.department_id ?? null,
    status: r.status,
    createdAt: toISO(r.created_at),
  };
}

/* ── Actor resolution ──────────────────────────────────────────────────── */

/**
 * Everything the policy engine needs about one person, in one round trip.
 *
 * Resolved once per request and passed down, never re-queried per check —
 * `can()` is synchronous precisely so that guarding every branch of a handler
 * is free.
 *
 * The three reads are independent, so they run concurrently. Each is indexed
 * on user_id because this runs on essentially every authenticated request.
 */
export async function resolveActor(userId: string): Promise<Actor> {
  const [memberships, teaching, enrollments, wards] = await Promise.all([
    db
      .prepare(
        `SELECT organization_id, role, department_id, status
         FROM organization_memberships
         WHERE user_id = ?`
      )
      .all(userId) as Promise<MembershipRow[]>,

    // course_id comes from the section rather than being stored twice, so a
    // course-level permission check resolves without the caller naming a
    // section.
    db
      .prepare(
        `SELECT st.organization_id, cs.course_id, st.course_section_id
         FROM section_teachers st
         JOIN course_sections cs ON cs.id = st.course_section_id
         WHERE st.user_id = ?`
      )
      .all(userId) as Promise<TeachingRow[]>,

    // Only active enrollment counts. A dropped student keeps the row so their
    // record and submitted work survive, but it must grant nothing.
    db
      .prepare(
        `SELECT e.organization_id, cs.course_id, e.course_section_id
         FROM enrollments e
         JOIN course_sections cs ON cs.id = e.course_section_id
         WHERE e.user_id = ? AND e.status = 'active'`
      )
      .all(userId) as Promise<EnrollmentRow[]>,

    // The children this adult may read about. Revoked links grant nothing:
    // family arrangements change, sometimes because a court decided they
    // should, and access has to end the moment a school says it has.
    db
      .prepare(
        `SELECT student_user_id FROM guardian_links
          WHERE guardian_user_id = ? AND revoked_at IS NULL`
      )
      .all(userId),
  ]);

  const actor = toActor(userId, { memberships, teaching, enrollments });
  const children = (wards as any[]).map((r) => r.student_user_id);

  return children.length > 0 ? { ...actor, guardianOf: children } : actor;
}

/* ── Academic structure ────────────────────────────────────────────────── */

export async function createDepartment(
  organizationId: string,
  name: string,
  code: string | null = null
): Promise<Department> {
  const id = newId();
  await db
    .prepare(`INSERT INTO departments (id, organization_id, name, code) VALUES (?, ?, ?, ?)`)
    .run(id, organizationId, name, code);
  return { id, organizationId, name, code };
}

export async function listDepartments(organizationId: string): Promise<Department[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, name, code FROM departments
       WHERE organization_id = ? ORDER BY name`
    )
    .all(organizationId);
  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    code: r.code ?? null,
  }));
}

export async function createAcademicYear(
  organizationId: string,
  input: AcademicYearInput
): Promise<AcademicYear> {
  const id = newId();

  // Marking a year current has to unset the previous one in the same
  // transaction: a partial-unique index enforces at most one, so doing these
  // as two statements would fail rather than silently produce two.
  await db.transaction(async () => {
    if (input.isCurrent) {
      await db
        .prepare(`UPDATE academic_years SET is_current = false WHERE organization_id = ?`)
        .run(organizationId);
    }
    await db
      .prepare(
        `INSERT INTO academic_years (id, organization_id, name, starts_on, ends_on, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, organizationId, input.name, input.startsOn, input.endsOn, input.isCurrent);
  })();

  return { id, organizationId, ...input };
}

export async function getCurrentAcademicYear(
  organizationId: string
): Promise<AcademicYear | null> {
  const r = await db
    .prepare(
      `SELECT id, organization_id, name, starts_on, ends_on, is_current
       FROM academic_years WHERE organization_id = ? AND is_current`
    )
    .get(organizationId);
  return r ? mapYear(r) : null;
}

function mapYear(r: any): AcademicYear {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    startsOn: toDateOnly(r.starts_on),
    endsOn: toDateOnly(r.ends_on),
    isCurrent: Boolean(r.is_current),
  };
}

export async function createTerm(organizationId: string, input: TermInput): Promise<Term> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO terms (id, organization_id, academic_year_id, name, starts_on, ends_on)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, organizationId, input.academicYearId, input.name, input.startsOn, input.endsOn);
  return { id, organizationId, ...input };
}

export async function listTerms(academicYearId: string): Promise<Term[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, academic_year_id, name, starts_on, ends_on
       FROM terms WHERE academic_year_id = ? ORDER BY starts_on`
    )
    .all(academicYearId);
  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    academicYearId: r.academic_year_id,
    name: r.name,
    startsOn: toDateOnly(r.starts_on),
    endsOn: toDateOnly(r.ends_on),
  }));
}

/* ── Column coercion ───────────────────────────────────────────────────── */

/**
 * These tables use real timestamptz and date columns, so node-postgres returns
 * Date objects rather than the ISO strings the legacy TEXT columns produced.
 * Normalising here keeps every DTO in the codebase a plain JSON-safe string.
 */
function toISO(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** A date column is a calendar day; rendering it with a time invites off-by-ones. */
function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

/* ── Administration ────────────────────────────────────────────────────── */

/** Organizations this person administers. Empty for everyone else. */
export async function administeredOrganizations(userId: string): Promise<Organization[]> {
  const rows = await db
    .prepare(
      `SELECT o.id, o.name, o.slug, o.timezone, o.locale, o.created_at
         FROM organization_memberships m
         JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = ? AND m.status = 'active'
          AND m.role IN ('INSTITUTION_ADMIN', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
        ORDER BY o.name`
    )
    .all(userId);
  return rows.map(mapOrganization);
}

export type OrganizationSummary = {
  students: number;
  teachers: number;
  courses: number;
  sections: number;
  publishedAssignments: number;
  awaitingMarking: number;
};

/**
 * The numbers an administrator opens the page for.
 *
 * One round trip rather than six, because a dashboard that takes six queries
 * to render is a dashboard nobody leaves open.
 */
export async function organizationSummary(
  organizationId: string
): Promise<OrganizationSummary> {
  const r = await db
    .prepare(
      `SELECT
         (SELECT COUNT(DISTINCT user_id)::int FROM organization_memberships
           WHERE organization_id = $1 AND role = 'STUDENT' AND status = 'active') AS students,
         (SELECT COUNT(DISTINCT user_id)::int FROM organization_memberships
           WHERE organization_id = $1 AND role IN ('TEACHER','TEACHING_ASSISTANT')
             AND status = 'active') AS teachers,
         (SELECT COUNT(*)::int FROM courses WHERE organization_id = $1) AS courses,
         (SELECT COUNT(*)::int FROM course_sections WHERE organization_id = $1) AS sections,
         (SELECT COUNT(*)::int FROM assignments
           WHERE organization_id = $1 AND status = 'published') AS published_assignments,
         (SELECT COUNT(*)::int FROM assignment_submissions
           WHERE organization_id = $1 AND status = 'submitted') AS awaiting_marking`
    )
    .get(organizationId);

  return {
    students: r.students,
    teachers: r.teachers,
    courses: r.courses,
    sections: r.sections,
    publishedAssignments: r.published_assignments,
    awaitingMarking: r.awaiting_marking,
  };
}

export type MemberRow = {
  userId: string;
  email: string | null;
  name: string | null;
  roles: string[];
  status: string;
  joinedAt: string;
};

/**
 * People in the institution, one row per person rather than per membership.
 *
 * Someone who teaches and studies holds two rows in the table and is one
 * person on this page; showing them twice would make the list a report about
 * the schema rather than about the school.
 */
/**
 * Everyone in an institution, a page at a time.
 *
 * This is the query that scales directly with how big a school is, and it was
 * the one with no limit on it: five thousand students meant five thousand rows
 * assembled, serialised, and handed to a browser that then had to render them.
 *
 * Ordered and paged by email because it is the only column here guaranteed
 * unique — a name is not, and a keyset cursor on a non-unique column skips
 * rows whenever two of them tie. `> ?` rather than `>= ?` for the same
 * reason: the cursor names the last row already seen.
 */
export async function listPeople(
  organizationId: string,
  options: { limit?: number; cursor?: string | null } = {}
): Promise<Page<MemberRow>> {
  const size = pageSize(options.limit);
  const after = decodeCursor(options.cursor);

  const rows = await db
    .prepare(
      `SELECT m.user_id, u.email, u.name,
              ARRAY_AGG(m.role ORDER BY m.role) AS roles,
              MIN(m.created_at) AS joined_at,
              BOOL_OR(m.status = 'active') AS any_active
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ?
          -- Cast: a parameter used only in a null test gives Postgres nothing
          -- to infer a type from.
          AND (?::text IS NULL OR u.email > ?)
        GROUP BY m.user_id, u.email, u.name
        ORDER BY u.email
        LIMIT ?`
    )
    // One more than asked for, so "is there another page" is answered without
    // a second COUNT over the whole table.
    .all(organizationId, after, after, size + 1);

  const mapped: MemberRow[] = rows.map((r: any) => ({
    userId: r.user_id,
    email: r.email ?? null,
    name: r.name ?? null,
    roles: r.roles ?? [],
    status: r.any_active ? "active" : "suspended",
    joinedAt: toISO(r.joined_at),
  }));

  return toPage(mapped, size, (row) => row.email ?? row.userId);
}

/* ── Where the institution is, and when it works ───────────────────────── */

export type OrganizationTime = {
  timezone: string;
  /** Day numbers, 0 = Sunday through 6 = Saturday. */
  restDays: number[];
  /** Which convention this institution writes grades in. */
  gradingScheme: string;
  /**
   * Whether student work may be sent to a model, and whose account decides.
   *
   * Defaults to off. A school that has not made this decision has not
   * implicitly made it.
   */
  aiPolicy: "off" | "institution" | "teacher";
};

/**
 * The institution's clock and working week.
 *
 * Defaulted rather than nullable: every deadline needs a zone to be written
 * against, and "unset" would mean every school that has not visited settings
 * yet has deadlines with no defined meaning.
 */
export async function getOrganizationTime(
  organizationId: string
): Promise<OrganizationTime> {
  const r = await db
    .prepare(`SELECT timezone, rest_days, grading_scheme, ai_policy FROM organizations WHERE id = ?`)
    .get(organizationId);

  const raw = String((r as any)?.rest_days ?? "0,6");
  const days = raw
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  return {
    timezone: String((r as any)?.timezone || "UTC"),
    restDays: days.length ? [...new Set(days)].sort() : [0, 6],
    gradingScheme: String((r as any)?.grading_scheme || "percent"),
    aiPolicy: (["off", "institution", "teacher"] as const).includes(
      (r as any)?.ai_policy
    )
      ? (r as any).ai_policy
      : "off",
  };
}

export async function setOrganizationTime(
  organizationId: string,
  input: {
    timezone: string;
    restDays: number[];
    gradingScheme?: string;
    aiPolicy?: "off" | "institution" | "teacher";
  }
): Promise<OrganizationTime> {
  // An unknown zone does not fail here — it fails later, inside a formatter,
  // while rendering somebody's deadline. Rejecting it at the boundary keeps
  // the error where someone can still fix it.
  let zone = "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    zone = input.timezone;
  } catch {
    throw new Error(`"${input.timezone}" is not a timezone Scholar recognises.`);
  }

  const days = [...new Set(input.restDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();

  // An unknown scheme id falls back rather than being stored: a grade written
  // in a convention nothing can render is worse than one written in the
  // default.
  const schemeId = SCHEMES.some((s) => s.id === input.gradingScheme)
    ? input.gradingScheme!
    : DEFAULT_SCHEME_ID;

  // An unrecognised policy resolves to off rather than being stored. The
  // restrictive direction is the safe one to fail in.
  const policy = (["off", "institution", "teacher"] as const).includes(
    input.aiPolicy as never
  )
    ? input.aiPolicy!
    : "off";

  await db
    .prepare(
      `UPDATE organizations
          SET timezone = ?, rest_days = ?, grading_scheme = ?, ai_policy = ?
        WHERE id = ?`
    )
    .run(
      zone, (days.length ? days : [0, 6]).join(","), schemeId, policy, organizationId
    );

  return getOrganizationTime(organizationId);
}

/**
 * How many people an institution has.
 *
 * Separate from listPeople because a page is no longer everyone, and "42
 * people in Northgate" is a different question from "here are the first
 * fifty". Counting in the database rather than measuring an array is the
 * whole point of having made the list a page.
 */
export async function countPeople(organizationId: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id)::int AS c
         FROM organization_memberships WHERE organization_id = ?`
    )
    .get(organizationId);
  return Number((r as any)?.c ?? 0);
}
