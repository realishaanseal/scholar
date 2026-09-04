import { z } from "zod";
import { db, newId } from "@/lib/db";
import { deleteBytes, putBytes, safeFilename } from "@/lib/storage";

/**
 * Files, assignment attachments, and the course library.
 *
 * Two different things a teacher hands out, kept apart on purpose:
 *
 *   attachments  belong to one assignment — the question sheet, the dataset.
 *                They appear with the brief and go away with it.
 *   materials    belong to the course — the textbook, the reading list, slide
 *                decks. They outlive any single piece of work, and a student
 *                should be able to find them without remembering which week's
 *                homework they were attached to.
 *
 * Conflating them is the usual mistake, and it is why so many course pages end
 * with students hunting for a PDF through six weeks of assignments.
 */

export type FileRecord = {
  id: string;
  organizationId: string;
  uploadedBy: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageKey: string;
  createdAt: string;
};

export const MATERIAL_KINDS = [
  "ebook", "document", "slides", "worksheet", "video", "link",
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export type CourseMaterial = {
  id: string;
  organizationId: string;
  courseId: string;
  fileId: string | null;
  url: string | null;
  title: string;
  description: string;
  kind: MaterialKind;
  isPublished: boolean;
  position: number;
  /** Joined from files when this material is a file. */
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

/* ── Files ─────────────────────────────────────────────────────────────── */

/**
 * Record an upload.
 *
 * Bytes go to whichever provider is configured; this row records where they
 * went, so a file uploaded before object storage was switched on keeps
 * working afterwards.
 */
export async function createFile(
  organizationId: string,
  uploadedBy: string,
  file: { filename: string; mimeType: string; bytes: Buffer }
): Promise<FileRecord> {
  const filename = safeFilename(file.filename);
  const stored = await putBytes(organizationId, filename, file.bytes, file.mimeType);

  const id = newId();
  await db
    .prepare(
      `INSERT INTO files
         (id, organization_id, uploaded_by, filename, mime_type, size_bytes,
          storage_provider, storage_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, organizationId, uploadedBy, filename, file.mimeType,
      stored.size, stored.provider, stored.key
    );

  const created = await getFile(id);
  if (!created) throw new Error("File was stored but could not be read back.");
  return created;
}

const FILE_COLUMNS = `id, organization_id, uploaded_by, filename, mime_type,
       size_bytes, storage_provider, storage_key, created_at`;

export async function getFile(id: string): Promise<FileRecord | null> {
  const r = await db.prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ?`).get(id);
  return r ? mapFile(r) : null;
}

/** Removes the row and the bytes. Links cascade. */
export async function deleteFile(id: string): Promise<void> {
  const file = await getFile(id);
  if (!file) return;
  await deleteBytes(file);
  await db.prepare(`DELETE FROM files WHERE id = ?`).run(id);
}

function mapFile(r: any): FileRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    uploadedBy: r.uploaded_by ?? null,
    filename: r.filename,
    mimeType: r.mime_type,
    // bigint arrives as a string from node-postgres; a file size fits a Number
    // comfortably, and JSON has nowhere to put a BigInt.
    sizeBytes: Number(r.size_bytes),
    storageProvider: r.storage_provider,
    storageKey: r.storage_key,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/* ── Assignment attachments ────────────────────────────────────────────── */

export async function attachToAssignment(
  organizationId: string,
  assignmentId: string,
  fileId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO assignment_files (assignment_id, file_id, organization_id, position)
       VALUES (?, ?, ?, COALESCE(
         (SELECT MAX(position) + 1 FROM assignment_files WHERE assignment_id = ?), 0))
       ON CONFLICT (assignment_id, file_id) DO NOTHING`
    )
    .run(assignmentId, fileId, organizationId, assignmentId);
}

export async function listAssignmentFiles(assignmentId: string): Promise<FileRecord[]> {
  const rows = await db
    .prepare(
      `SELECT ${FILE_COLUMNS.split(",").map((c) => "f." + c.trim()).join(", ")}
         FROM assignment_files af
         JOIN files f ON f.id = af.file_id
        WHERE af.assignment_id = ?
        ORDER BY af.position, f.created_at`
    )
    .all(assignmentId);
  return rows.map(mapFile);
}

/** Detaching removes the link; the file itself survives if used elsewhere. */
export async function detachFromAssignment(
  assignmentId: string,
  fileId: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM assignment_files WHERE assignment_id = ? AND file_id = ?`)
    .run(assignmentId, fileId);
}

/* ── Course materials ──────────────────────────────────────────────────── */

export const materialInputSchema = z
  .object({
    title: z.string().trim().min(2, "Give the material a title.").max(200),
    description: z.string().trim().max(2000).default(""),
    kind: z.enum(MATERIAL_KINDS).default("document"),
    fileId: z.string().min(1).nullable().default(null),
    url: z.string().url("Enter a valid link.").nullable().default(null),
  })
  // Mirrors the CHECK constraint, so a mistake reads as a sentence rather than
  // a constraint violation surfacing as a 500.
  .refine((v) => Boolean(v.fileId) !== Boolean(v.url), {
    message: "A material is either an uploaded file or a link, not both.",
    path: ["url"],
  });
export type MaterialInput = z.infer<typeof materialInputSchema>;

export async function createMaterial(
  organizationId: string,
  courseId: string,
  input: MaterialInput
): Promise<CourseMaterial> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO course_materials
         (id, organization_id, course_id, file_id, url, title, description, kind, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
         (SELECT MAX(position) + 1 FROM course_materials WHERE course_id = ?), 0))`
    )
    .run(
      id, organizationId, courseId, input.fileId, input.url,
      input.title, input.description, input.kind, courseId
    );

  const created = await getMaterial(id);
  if (!created) throw new Error("Material was created but could not be read back.");
  return created;
}

const MATERIAL_SELECT = `SELECT m.id, m.organization_id, m.course_id, m.file_id, m.url,
              m.title, m.description, m.kind, m.is_published, m.position,
              f.filename, f.mime_type, f.size_bytes
         FROM course_materials m
         LEFT JOIN files f ON f.id = m.file_id`;

export async function getMaterial(id: string): Promise<CourseMaterial | null> {
  const r = await db.prepare(`${MATERIAL_SELECT} WHERE m.id = ?`).get(id);
  return r ? mapMaterial(r) : null;
}

export async function listMaterials(
  courseId: string,
  opts: { publishedOnly?: boolean } = {}
): Promise<CourseMaterial[]> {
  const rows = opts.publishedOnly
    ? await db
        .prepare(
          `${MATERIAL_SELECT} WHERE m.course_id = ? AND m.is_published
            ORDER BY m.position, m.created_at`
        )
        .all(courseId)
    : await db
        .prepare(`${MATERIAL_SELECT} WHERE m.course_id = ? ORDER BY m.position, m.created_at`)
        .all(courseId);
  return rows.map(mapMaterial);
}

/** Publishing is what makes a material visible to students. */
export async function setMaterialPublished(id: string, published: boolean): Promise<void> {
  await db
    .prepare(`UPDATE course_materials SET is_published = ? WHERE id = ?`)
    .run(published, id);
}

/**
 * Remove a material, and the file behind it if nothing else uses it.
 *
 * Leaving orphaned bytes in storage forever is how a bill grows without
 * anybody deciding anything.
 */
export async function deleteMaterial(id: string): Promise<void> {
  const material = await getMaterial(id);
  if (!material) return;

  await db.prepare(`DELETE FROM course_materials WHERE id = ?`).run(id);

  if (material.fileId) {
    const stillUsed = await db
      .prepare(
        `SELECT 1 AS used FROM course_materials WHERE file_id = ?
          UNION ALL
         SELECT 1 FROM assignment_files WHERE file_id = ?
          LIMIT 1`
      )
      .get(material.fileId, material.fileId);
    if (!stillUsed) await deleteFile(material.fileId);
  }
}

function mapMaterial(r: any): CourseMaterial {
  return {
    id: r.id,
    organizationId: r.organization_id,
    courseId: r.course_id,
    fileId: r.file_id ?? null,
    url: r.url ?? null,
    title: r.title,
    description: r.description ?? "",
    kind: r.kind,
    isPublished: Boolean(r.is_published),
    position: r.position,
    filename: r.filename ?? null,
    mimeType: r.mime_type ?? null,
    sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : Number(r.size_bytes),
  };
}

/* ── Scope resolution ──────────────────────────────────────────────────── */

/** Where a file lives, so a route can authorize against its real institution. */
export async function scopeOfFile(
  fileId: string
): Promise<{ organizationId: string } | null> {
  const r = await db.prepare(`SELECT organization_id FROM files WHERE id = ?`).get(fileId);
  return r ? { organizationId: r.organization_id } : null;
}

export async function scopeOfMaterial(
  materialId: string
): Promise<{ organizationId: string; courseId: string } | null> {
  const r = await db
    .prepare(`SELECT organization_id, course_id FROM course_materials WHERE id = ?`)
    .get(materialId);
  return r ? { organizationId: r.organization_id, courseId: r.course_id } : null;
}

export async function scopeOfCourse(
  courseId: string
): Promise<{ organizationId: string; courseId: string } | null> {
  const r = await db
    .prepare(`SELECT organization_id, id FROM courses WHERE id = ?`)
    .get(courseId);
  return r ? { organizationId: r.organization_id, courseId: r.id } : null;
}

/**
 * Can this person reach this file at all?
 *
 * A file is reachable if it is attached to an assignment or published as a
 * material in a course the actor has a relationship with. Resolved as course
 * ids so the caller can run the ordinary permission check against each rather
 * than inventing a second authorization path for files.
 */
export async function coursesReferencingFile(fileId: string): Promise<
  { courseId: string; courseSectionId: string | null; publishedMaterial: boolean }[]
> {
  const rows = await db
    .prepare(
      `SELECT cs.course_id, cs.id AS course_section_id, false AS published_material
         FROM assignment_files af
         JOIN assignments a ON a.id = af.assignment_id
         JOIN course_sections cs ON cs.id = a.course_section_id
        WHERE af.file_id = ?
        UNION ALL
       SELECT m.course_id, NULL AS course_section_id, m.is_published
         FROM course_materials m
        WHERE m.file_id = ?`
    )
    .all(fileId, fileId);

  return rows.map((r: any) => ({
    courseId: r.course_id,
    courseSectionId: r.course_section_id ?? null,
    publishedMaterial: Boolean(r.published_material),
  }));
}

/**
 * Everything a student has been given, across every course they take.
 *
 * Materials lived inside a per-course tab, which means a student who wants
 * "the physics ebook" has to first remember which course it is under. That is
 * the wrong shape: a library is a place you browse, and browsing one shelf at
 * a time with the shelves in separate rooms is not browsing.
 *
 * Ordered by what is actually due rather than alphabetically. Scholar is the
 * only system here that knows which of a student's work is imminent, so on
 * Wednesday the material for Friday's essay belongs at the top. That is the
 * join no other library has available to it.
 */
export type StudentMaterial = CourseMaterial & {
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  /** Hours until the soonest outstanding work in this course. Null when none. */
  hoursUntilDue: number | null;
};

export async function materialsForStudent(
  userId: string,
  organizationId: string
): Promise<StudentMaterial[]> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.organization_id, m.course_id, m.title, m.description,
              m.kind, m.file_id, m.url, m.is_published, m.position, m.created_at,
              c.code AS course_code, c.title AS course_title,
              cs.id AS section_id,
              -- The soonest thing still outstanding in this course, which is
              -- what decides whether this shelf matters today.
              (
                SELECT MIN(a.due_at)
                  FROM assignments a
                 WHERE a.course_section_id = cs.id
                   AND a.status = 'published'
                   AND a.due_at > now()
                   AND NOT EXISTS (
                     SELECT 1 FROM assignment_submissions s
                      WHERE s.assignment_id = a.id AND s.user_id = e.user_id
                   )
                   AND (
                     NOT EXISTS (SELECT 1 FROM assignment_assignees x WHERE x.assignment_id = a.id)
                     OR EXISTS (
                       SELECT 1 FROM assignment_assignees x
                        WHERE x.assignment_id = a.id AND x.user_id = e.user_id
                     )
                   )
              ) AS next_due
         FROM enrollments e
         JOIN course_sections cs ON cs.id = e.course_section_id
         JOIN courses c ON c.id = cs.course_id
         JOIN course_materials m ON m.course_id = c.id AND m.is_published
        WHERE e.user_id = ? AND e.status = 'active'
          AND cs.organization_id = ?
        ORDER BY next_due NULLS LAST, c.code, m.position, m.created_at`
    )
    .all(userId, organizationId);

  const now = Date.now();
  return (rows as any[]).map((r) => {
    const due = r.next_due instanceof Date ? r.next_due.getTime()
      : r.next_due ? Date.parse(r.next_due) : null;
    return {
      ...mapMaterial(r),
      courseCode: String(r.course_code ?? ""),
      courseTitle: String(r.course_title ?? ""),
      sectionId: r.section_id,
      hoursUntilDue: due === null ? null : Math.max(0, Math.round((due - now) / 3_600_000)),
    };
  });
}
