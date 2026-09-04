import { db, newId } from "@/lib/db";

/**
 * Groups of people that outlive any one course.
 *
 * "Year 9" is a fact about a school, not about a class, and it is the unit an
 * administrator actually thinks in. Linking it to a section enrols everybody
 * in it and keeps doing so, which is the difference between enrolling thirty
 * students today and saying that this class *is* Year 9.
 *
 * Sync only ever adds. Removing somebody from a cohort does not unenrol them:
 * a student who leaves a tutor group in March has still done the work in
 * those courses, and their submissions and marks belong to them. Withdrawing
 * an enrolment stays an explicit act with a name on it rather than a side
 * effect of tidying a list.
 */

export type Cohort = {
  id: string;
  name: string;
  description: string;
  members: number;
  sections: number;
};

export async function createCohort(
  organizationId: string,
  createdBy: string,
  name: string,
  description = ""
): Promise<Cohort> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO cohorts (id, organization_id, name, description, created_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (organization_id, name) DO NOTHING`
    )
    .run(id, organizationId, name.trim(), description, createdBy);

  // Re-read: the insert may have been skipped because this school already has
  // a "Year 9", which is the right outcome — a second one is a typo rather
  // than a second year group.
  const found = await getCohortByName(organizationId, name.trim());
  if (!found) throw new Error("The cohort could not be created.");
  return found;
}

const COHORT_SELECT = `
  SELECT c.id, c.name, c.description,
         (SELECT COUNT(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS members,
         (SELECT COUNT(*)::int FROM cohort_sections s WHERE s.cohort_id = c.id) AS sections
    FROM cohorts c`;

function map(r: any): Cohort {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    members: Number(r.members ?? 0),
    sections: Number(r.sections ?? 0),
  };
}

export async function listCohorts(organizationId: string): Promise<Cohort[]> {
  const rows = await db
    .prepare(`${COHORT_SELECT} WHERE c.organization_id = ? ORDER BY c.name`)
    .all(organizationId);
  return (rows as any[]).map(map);
}

export async function getCohortByName(
  organizationId: string,
  name: string
): Promise<Cohort | null> {
  const r = await db
    .prepare(`${COHORT_SELECT} WHERE c.organization_id = ? AND c.name = ?`)
    .get(organizationId, name);
  return r ? map(r) : null;
}

/**
 * Add people to a cohort, and enrol them wherever it is already linked.
 *
 * The second half is the point. Somebody added to Year 9 in March should land
 * in all eleven of its courses without anybody remembering to do it.
 */
export async function addToCohort(
  organizationId: string,
  cohortId: string,
  userIds: string[]
): Promise<{ added: number; enrolled: number }> {
  let added = 0;

  for (const userId of userIds) {
    const rows = await db
      .prepare(
        `INSERT INTO cohort_members (id, organization_id, cohort_id, user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (cohort_id, user_id) DO NOTHING
         RETURNING id`
      )
      .all(newId(), organizationId, cohortId, userId);
    if ((rows as any[]).length > 0) added++;
  }

  return { added, enrolled: await syncCohort(organizationId, cohortId) };
}

/**
 * Remove somebody from a cohort.
 *
 * Their enrolments stay. See the note at the top: work already done belongs
 * to the student who did it, and unenrolling is a separate, deliberate act.
 */
export async function removeFromCohort(
  cohortId: string,
  userId: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?`)
    .run(cohortId, userId);
}

/** Make this class be this cohort, from now on. */
export async function linkCohortToSection(input: {
  organizationId: string;
  cohortId: string;
  sectionId: string;
  linkedBy: string;
}): Promise<number> {
  await db
    .prepare(
      `INSERT INTO cohort_sections
         (id, organization_id, cohort_id, course_section_id, linked_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (cohort_id, course_section_id) DO NOTHING`
    )
    .run(newId(), input.organizationId, input.cohortId, input.sectionId, input.linkedBy);

  return syncCohort(input.organizationId, input.cohortId);
}

export async function unlinkCohortFromSection(
  cohortId: string,
  sectionId: string
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM cohort_sections WHERE cohort_id = ? AND course_section_id = ?`
    )
    .run(cohortId, sectionId);
}

/**
 * Enrol every member of a cohort into every section it is linked to.
 *
 * One statement rather than a loop over members × sections: a year group of
 * two hundred across eleven courses is two thousand two hundred rows, and
 * doing that as individual inserts from JavaScript would take long enough
 * that somebody would close the tab.
 *
 * Returns how many enrolments were actually created, which is zero on a
 * re-run — that is what makes this safe to call after every change.
 */
export async function syncCohort(
  organizationId: string,
  cohortId: string
): Promise<number> {
  const rows = await db
    .prepare(
      `INSERT INTO enrollments
         (id, organization_id, course_section_id, user_id, status)
       SELECT gen_random_uuid()::text, ?, cs.course_section_id, cm.user_id, 'active'
         FROM cohort_sections cs
         JOIN cohort_members cm ON cm.cohort_id = cs.cohort_id
        WHERE cs.cohort_id = ?
       ON CONFLICT DO NOTHING
       RETURNING id`
    )
    .all(organizationId, cohortId);
  return (rows as any[]).length;
}

export type CohortDetail = Cohort & {
  people: Array<{ userId: string; name: string | null; email: string | null }>;
  linkedSections: Array<{ sectionId: string; label: string }>;
};

export async function getCohort(
  organizationId: string,
  cohortId: string
): Promise<CohortDetail | null> {
  const base = await db
    .prepare(`${COHORT_SELECT} WHERE c.organization_id = ? AND c.id = ?`)
    .get(organizationId, cohortId);
  if (!base) return null;

  const [people, sections] = await Promise.all([
    db
      .prepare(
        `SELECT m.user_id, u.name, u.email
           FROM cohort_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.cohort_id = ?
          ORDER BY u.name NULLS LAST, u.email`
      )
      .all(cohortId),
    db
      .prepare(
        `SELECT cs.course_section_id, c.code, s.name
           FROM cohort_sections cs
           JOIN course_sections s ON s.id = cs.course_section_id
           JOIN courses c ON c.id = s.course_id
          WHERE cs.cohort_id = ?
          ORDER BY c.code, s.name`
      )
      .all(cohortId),
  ]);

  return {
    ...map(base),
    people: (people as any[]).map((p) => ({
      userId: p.user_id, name: p.name ?? null, email: p.email ?? null,
    })),
    linkedSections: (sections as any[]).map((s) => ({
      sectionId: s.course_section_id, label: `${s.code} · ${s.name}`,
    })),
  };
}
