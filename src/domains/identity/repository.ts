import { db, newId } from "@/lib/db";
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
  const [memberships, teaching, enrollments] = await Promise.all([
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
  ]);

  return toActor(userId, { memberships, teaching, enrollments });
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
