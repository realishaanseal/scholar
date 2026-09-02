import { db, newId } from "@/lib/db";
import type {
  Course, CourseSection, CreateCourseInput, CreateLessonInput, CreateModuleInput,
  CreateSectionInput, Enrollment, Lesson, Module,
} from "./types";

/**
 * Data access for courses, sections, enrollment and module content.
 *
 * Every write takes `organizationId` explicitly rather than deriving it from
 * the parent row. The composite foreign keys in migration 0003 then reject any
 * combination that crosses a tenant, so a caller passing the wrong institution
 * gets a database error rather than a quietly misfiled row.
 */

/* ── Courses ───────────────────────────────────────────────────────────── */

export async function createCourse(
  organizationId: string,
  input: CreateCourseInput
): Promise<Course> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO courses (id, organization_id, department_id, code, title, description, credits)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, organizationId, input.departmentId, input.code,
      input.title, input.description, input.credits
    );
  const course = await getCourse(id);
  if (!course) throw new Error("Course was created but could not be read back.");
  return course;
}

export async function getCourse(id: string): Promise<Course | null> {
  const r = await db
    .prepare(
      `SELECT id, organization_id, department_id, code, title, description, credits, status
       FROM courses WHERE id = ?`
    )
    .get(id);
  return r ? mapCourse(r) : null;
}

/** Publishing is a separate deliberate act — a draft course is invisible to students. */
export async function setCourseStatus(
  id: string,
  status: "draft" | "published" | "archived"
): Promise<void> {
  await db
    .prepare(`UPDATE courses SET status = ?, updated_at = now() WHERE id = ?`)
    .run(status, id);
}

export async function listCourses(
  organizationId: string,
  opts: { publishedOnly?: boolean } = {}
): Promise<Course[]> {
  const rows = opts.publishedOnly
    ? await db
        .prepare(
          `SELECT id, organization_id, department_id, code, title, description, credits, status
           FROM courses WHERE organization_id = ? AND status = 'published' ORDER BY code`
        )
        .all(organizationId)
    : await db
        .prepare(
          `SELECT id, organization_id, department_id, code, title, description, credits, status
           FROM courses WHERE organization_id = ? ORDER BY code`
        )
        .all(organizationId);
  return rows.map(mapCourse);
}

function mapCourse(r: any): Course {
  return {
    id: r.id,
    organizationId: r.organization_id,
    departmentId: r.department_id ?? null,
    code: r.code,
    title: r.title,
    description: r.description ?? "",
    // numeric comes back as a string from node-postgres to avoid float loss.
    credits: r.credits === null || r.credits === undefined ? null : Number(r.credits),
    status: r.status,
  };
}

/* ── Sections ──────────────────────────────────────────────────────────── */

export async function createSection(
  organizationId: string,
  input: CreateSectionInput
): Promise<CourseSection> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO course_sections (id, organization_id, course_id, term_id, name, capacity)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, organizationId, input.courseId, input.termId, input.name, input.capacity);
  return { id, organizationId, ...input };
}

export async function listSections(courseId: string): Promise<CourseSection[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, course_id, term_id, name, capacity
       FROM course_sections WHERE course_id = ? ORDER BY name`
    )
    .all(courseId);
  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    courseId: r.course_id,
    termId: r.term_id,
    name: r.name,
    capacity: r.capacity ?? null,
  }));
}

/* ── Teaching and enrollment ───────────────────────────────────────────── */

/**
 * Assign a teacher to a section.
 *
 * This is the row that turns "is a teacher at this institution" into "may
 * grade this section" — the membership alone grants nothing course-bound.
 */
export async function assignTeacher(
  organizationId: string,
  courseSectionId: string,
  userId: string,
  role: "TEACHER" | "TEACHING_ASSISTANT" = "TEACHER"
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO section_teachers (id, organization_id, course_section_id, user_id, role)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (course_section_id, user_id) DO UPDATE SET role = EXCLUDED.role`
    )
    .run(newId(), organizationId, courseSectionId, userId, role);
}

export async function removeTeacher(courseSectionId: string, userId: string): Promise<void> {
  await db
    .prepare(`DELETE FROM section_teachers WHERE course_section_id = ? AND user_id = ?`)
    .run(courseSectionId, userId);
}

export async function enroll(
  organizationId: string,
  courseSectionId: string,
  userId: string
): Promise<Enrollment> {
  const id = newId();
  // Re-enrolling someone who dropped reactivates the original row, so their
  // history and any submitted work stay attached to one enrollment.
  await db
    .prepare(
      `INSERT INTO enrollments (id, organization_id, course_section_id, user_id, status)
       VALUES (?, ?, ?, ?, 'active')
       ON CONFLICT (course_section_id, user_id) DO UPDATE SET status = 'active'`
    )
    .run(id, organizationId, courseSectionId, userId);

  const r = await db
    .prepare(
      `SELECT id, organization_id, course_section_id, user_id, status, enrolled_at
       FROM enrollments WHERE course_section_id = ? AND user_id = ?`
    )
    .get(courseSectionId, userId);
  return mapEnrollment(r);
}

/**
 * Drop a student without deleting the row.
 *
 * The enrollment is the anchor for submissions and grades; removing it would
 * erase a record of work that was genuinely done. Access stops because
 * resolveActor only reads active rows.
 */
export async function setEnrollmentStatus(
  courseSectionId: string,
  userId: string,
  status: "active" | "dropped" | "completed"
): Promise<void> {
  await db
    .prepare(`UPDATE enrollments SET status = ? WHERE course_section_id = ? AND user_id = ?`)
    .run(status, courseSectionId, userId);
}

export async function listRoster(courseSectionId: string): Promise<Enrollment[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, course_section_id, user_id, status, enrolled_at
       FROM enrollments WHERE course_section_id = ? AND status = 'active' ORDER BY enrolled_at`
    )
    .all(courseSectionId);
  return rows.map(mapEnrollment);
}

function mapEnrollment(r: any): Enrollment {
  return {
    id: r.id,
    organizationId: r.organization_id,
    courseSectionId: r.course_section_id,
    userId: r.user_id,
    status: r.status,
    enrolledAt: r.enrolled_at instanceof Date ? r.enrolled_at.toISOString() : String(r.enrolled_at),
  };
}

/* ── Modules and lessons ───────────────────────────────────────────────── */

export async function createModule(
  organizationId: string,
  input: CreateModuleInput
): Promise<Module> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO modules
         (id, organization_id, course_id, title, summary, position, prerequisite_module_id, estimated_mins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, organizationId, input.courseId, input.title, input.summary,
      input.position, input.prerequisiteModuleId, input.estimatedMins
    );
  return { id, organizationId, isPublished: false, ...input };
}

export async function listModules(courseId: string): Promise<Module[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, course_id, title, summary, position,
              is_published, prerequisite_module_id, estimated_mins
       FROM modules WHERE course_id = ? ORDER BY position, created_at`
    )
    .all(courseId);
  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    courseId: r.course_id,
    title: r.title,
    summary: r.summary ?? "",
    position: r.position,
    isPublished: Boolean(r.is_published),
    prerequisiteModuleId: r.prerequisite_module_id ?? null,
    estimatedMins: r.estimated_mins ?? null,
  }));
}

export async function createLesson(
  organizationId: string,
  input: CreateLessonInput
): Promise<Lesson> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO lessons
         (id, organization_id, module_id, title, kind, body, url, position, estimated_mins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, organizationId, input.moduleId, input.title, input.kind,
      input.body, input.url, input.position, input.estimatedMins
    );
  return { id, organizationId, isPublished: false, ...input };
}

export async function listLessons(moduleId: string): Promise<Lesson[]> {
  const rows = await db
    .prepare(
      `SELECT id, organization_id, module_id, title, kind, body, url,
              position, is_published, estimated_mins
       FROM lessons WHERE module_id = ? ORDER BY position, created_at`
    )
    .all(moduleId);
  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    moduleId: r.module_id,
    title: r.title,
    kind: r.kind,
    body: r.body ?? "",
    url: r.url ?? null,
    position: r.position,
    isPublished: Boolean(r.is_published),
    estimatedMins: r.estimated_mins ?? null,
  }));
}

/* ── Teaching surfaces ─────────────────────────────────────────────────── */

/** A section as a teacher sees it in their own list. */
export type TeachingSection = {
  id: string;
  organizationId: string;
  organizationName: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  name: string;
  role: string;
  enrolledCount: number;
  openAssignments: number;
  ungradedSubmissions: number;
};

/**
 * Every section this person teaches, with the two counts that decide what they
 * do next.
 *
 * The counts are computed in the query rather than by fetching rosters and
 * counting in JavaScript: a teacher with eight sections would otherwise cost
 * seventeen round trips to render one list.
 */
export async function listSectionsForTeacher(userId: string): Promise<TeachingSection[]> {
  const rows = await db
    .prepare(
      `SELECT cs.id, cs.name, cs.organization_id, cs.course_id,
              o.name AS organization_name,
              c.code AS course_code, c.title AS course_title,
              t.name AS term_name,
              st.role,
              (SELECT COUNT(*)::int FROM enrollments e
                WHERE e.course_section_id = cs.id AND e.status = 'active') AS enrolled_count,
              (SELECT COUNT(*)::int FROM assignments a
                WHERE a.course_section_id = cs.id AND a.status = 'published') AS open_assignments,
              (SELECT COUNT(*)::int FROM assignment_submissions s
                 JOIN assignments a2 ON a2.id = s.assignment_id
                WHERE a2.course_section_id = cs.id
                  AND s.status = 'submitted') AS ungraded_submissions
         FROM section_teachers st
         JOIN course_sections cs ON cs.id = st.course_section_id
         JOIN courses c ON c.id = cs.course_id
         JOIN organizations o ON o.id = cs.organization_id
         JOIN terms t ON t.id = cs.term_id
        WHERE st.user_id = ?
        ORDER BY o.name, c.code, cs.name`
    )
    .all(userId);

  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    courseId: r.course_id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    termName: r.term_name,
    name: r.name,
    role: r.role,
    enrolledCount: r.enrolled_count,
    openAssignments: r.open_assignments,
    ungradedSubmissions: r.ungraded_submissions,
  }));
}

/** Does this person teach anything at all? Cheap enough for a nav decision. */
export async function teachesAnything(userId: string): Promise<boolean> {
  const r = await db
    .prepare(`SELECT 1 AS present FROM section_teachers WHERE user_id = ? LIMIT 1`)
    .get(userId);
  return Boolean(r);
}

/** One section, with the course and term names a header needs. */
export async function getSectionDetail(sectionId: string): Promise<TeachingSection | null> {
  const r = await db
    .prepare(
      `SELECT cs.id, cs.name, cs.organization_id, cs.course_id,
              o.name AS organization_name,
              c.code AS course_code, c.title AS course_title,
              t.name AS term_name,
              (SELECT COUNT(*)::int FROM enrollments e
                WHERE e.course_section_id = cs.id AND e.status = 'active') AS enrolled_count
         FROM course_sections cs
         JOIN courses c ON c.id = cs.course_id
         JOIN organizations o ON o.id = cs.organization_id
         JOIN terms t ON t.id = cs.term_id
        WHERE cs.id = ?`
    )
    .get(sectionId);

  if (!r) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    courseId: r.course_id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    termName: r.term_name,
    name: r.name,
    role: "TEACHER",
    enrolledCount: r.enrolled_count,
    openAssignments: 0,
    ungradedSubmissions: 0,
  };
}
