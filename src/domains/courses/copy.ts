import { db, newId } from "@/lib/db";

/**
 * Copying a course into a new year.
 *
 * The largest single time-saver every vendor advertises, and the reason it
 * matters is uncomfortable: without it, having built a year's work *inside*
 * Scholar becomes a reason to leave. A teacher who must rebuild every
 * September will keep the master copy somewhere else, and then Scholar is
 * merely where they retype things.
 *
 * What travels is the shape of the course: assignments, their rubrics, their
 * grade categories, the library. What does not travel is anybody's work,
 * anybody's marks, and any deadline.
 *
 * Deadlines are dropped rather than shifted by a year. A date moved
 * automatically is a date nobody checked, and the failure mode is a class
 * discovering on Monday that something was due on Sunday. Copied work arrives
 * as drafts with no deadline, which is the state that forces the five minutes
 * of attention it actually needs.
 */

export type CopyResult = {
  sectionId: string;
  assignments: number;
  rubrics: number;
  categories: number;
  materials: number;
};

/**
 * Copy one section's teaching into another.
 *
 * Takes an existing target section rather than creating one: deciding which
 * term and which class this becomes is a judgement the caller has already
 * made, and a copy that silently invents a section is one somebody then has
 * to go and find.
 */
export async function copySectionInto(input: {
  organizationId: string;
  fromSectionId: string;
  toSectionId: string;
  createdBy: string;
}): Promise<CopyResult> {
  const { organizationId, fromSectionId, toSectionId, createdBy } = input;

  const target = await db
    .prepare(`SELECT course_id FROM course_sections WHERE id = ?`)
    .get(toSectionId);
  if (!target) throw new Error("The section being copied into does not exist.");
  const toCourseId = (target as any).course_id;

  const source = await db
    .prepare(`SELECT course_id FROM course_sections WHERE id = ?`)
    .get(fromSectionId);
  if (!source) throw new Error("The section being copied from does not exist.");
  const fromCourseId = (source as any).course_id;

  // Rubrics first: assignments point at them, so they have to exist before
  // the rows that reference them are written.
  const rubricMap = new Map<string, string>();
  const rubricRows = await db
    .prepare(
      `SELECT DISTINCT r.id, r.title, r.description
         FROM rubrics r
         JOIN assignments a ON a.rubric_id = r.id
        WHERE a.course_section_id = ?`
    )
    .all(fromSectionId);

  for (const r of rubricRows as any[]) {
    const newRubricId = newId();
    await db
      .prepare(
        `INSERT INTO rubrics (id, organization_id, course_id, title, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(newRubricId, organizationId, toCourseId, r.title, r.description ?? "", createdBy);

    const criteria = await db
      .prepare(
        `SELECT id, title, description, points, position
           FROM rubric_criteria WHERE rubric_id = ? ORDER BY position`
      )
      .all(r.id);

    for (const c of criteria as any[]) {
      const newCriterionId = newId();
      await db
        .prepare(
          `INSERT INTO rubric_criteria
             (id, organization_id, rubric_id, title, description, points, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          newCriterionId, organizationId, newRubricId, c.title,
          c.description ?? "", c.points, c.position
        );

      const levels = await db
        .prepare(
          `SELECT label, description, points, position
             FROM rubric_levels WHERE criterion_id = ? ORDER BY position`
        )
        .all(c.id);

      for (const l of levels as any[]) {
        await db
          .prepare(
            `INSERT INTO rubric_levels
               (id, organization_id, criterion_id, label, description, points, position)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            newId(), organizationId, newCriterionId, l.label,
            l.description ?? "", l.points, l.position
          );
      }
    }
    rubricMap.set(r.id, newRubricId);
  }

  // Grade categories, so copied assignments keep their weighting.
  const categoryMap = new Map<string, string>();
  const categories = await db
    .prepare(`SELECT id, name, weight, position FROM grade_categories WHERE course_id = ?`)
    .all(fromCourseId);

  for (const c of categories as any[]) {
    await db
      .prepare(
        `INSERT INTO grade_categories
           (id, organization_id, course_id, name, weight, position)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (course_id, name) DO NOTHING`
      )
      .run(newId(), organizationId, toCourseId, c.name, c.weight, c.position);

    // Re-read rather than trusting the insert: it may have been skipped
    // because the target course already had a category by that name, which is
    // the right outcome and means the id to map to is the existing one.
    const existing = await db
      .prepare(`SELECT id FROM grade_categories WHERE course_id = ? AND name = ?`)
      .get(toCourseId, c.name);
    if (existing) categoryMap.set(c.id, (existing as any).id);
  }

  // Assignments, as drafts, with no deadline.
  const assignments = await db
    .prepare(
      `SELECT title, instructions, points, submission_type, kind, max_attempts,
              late_policy, estimated_mins, rubric_id, rubric_scores, grade_posting,
              grade_category_id
         FROM assignments
        WHERE course_section_id = ?
        ORDER BY created_at`
    )
    .all(fromSectionId);

  for (const a of assignments as any[]) {
    await db
      .prepare(
        `INSERT INTO assignments
           (id, organization_id, course_section_id, created_by, title, instructions,
            points, submission_type, kind, max_attempts, late_policy, estimated_mins,
            rubric_id, rubric_scores, grade_posting, grade_category_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
      )
      .run(
        newId(), organizationId, toSectionId, createdBy, a.title,
        a.instructions ?? "", a.points, a.submission_type, a.kind,
        a.max_attempts, a.late_policy, a.estimated_mins,
        a.rubric_id ? rubricMap.get(a.rubric_id) ?? null : null,
        a.rubric_scores, a.grade_posting,
        a.grade_category_id ? categoryMap.get(a.grade_category_id) ?? null : null
      );
  }

  // The library, by reference. The same file row is linked rather than its
  // bytes copied: a textbook does not become a second textbook because it is
  // taught again. Skipped entirely when both sections share a course, since
  // the library already belongs to it.
  let materialCount = 0;
  if (toCourseId !== fromCourseId) {
    const materials = await db
      .prepare(
        `SELECT title, description, kind, file_id, url, published
           FROM course_materials WHERE course_id = ?`
      )
      .all(fromCourseId);

    for (const m of materials as any[]) {
      await db
        .prepare(
          `INSERT INTO course_materials
             (id, organization_id, course_id, title, description, kind, file_id, url, published)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          newId(), organizationId, toCourseId, m.title, m.description ?? "",
          m.kind, m.file_id, m.url, m.published
        );
      materialCount++;
    }
  }

  return {
    sectionId: toSectionId,
    assignments: (assignments as any[]).length,
    rubrics: rubricMap.size,
    categories: categoryMap.size,
    materials: materialCount,
  };
}
