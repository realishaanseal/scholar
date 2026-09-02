/**
 * 0005 — files, assignment attachments, and course materials.
 *
 * The existing `attachments` table keeps bytes as base64 in a TEXT column.
 * That was a reasonable shortcut for a photo of a worksheet; it is the wrong
 * shape for what a teacher actually wants to hand out. Base64 inflates by a
 * third, the bytes travel with every row read, and a set text will happily be
 * a 40MB PDF.
 *
 * So files are modelled with the location of the bytes as a property rather
 * than an assumption. `storage_provider` and `storage_key` say where they
 * live; the same row works whether that is a Postgres blob today or object
 * storage tomorrow, and moving one is an UPDATE rather than a migration.
 *
 * The bytes live in their own table for the Postgres provider, because a
 * teacher opening a materials list wants twelve filenames, not twelve
 * megabytes. Splitting them means listing files never touches the payload.
 *
 * The old attachments table is left exactly as it is. It holds real user data
 * and works; this sits beside it for institutional files rather than
 * migrating personal ones on the way past.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS files (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Nullable: a member leaving must not delete the textbook they uploaded.
  uploaded_by       text REFERENCES users(id) ON DELETE SET NULL,
  filename          text NOT NULL,
  mime_type         text NOT NULL DEFAULT 'application/octet-stream',
  -- bigint, not integer: a 4GB integer ceiling is a strange thing to discover
  -- from a video upload.
  size_bytes        bigint NOT NULL DEFAULT 0,
  -- Where the bytes actually are. 'postgres' | 'vercel-blob' | ...
  storage_provider  text NOT NULL DEFAULT 'postgres',
  -- Opaque to everything but the provider that wrote it: a row id, an object
  -- key, a URL.
  storage_key       text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CONSTRAINT files_size_nonnegative CHECK (size_bytes >= 0)
);

/*
  Payload for the Postgres provider only. Separate so that listing files —
  which happens on every materials page — reads filenames and sizes without
  dragging the contents along.
*/
CREATE TABLE IF NOT EXISTS file_bytes (
  file_id  text PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  data     text NOT NULL
);

-- What a teacher attaches to the brief: the question sheet, the dataset.
CREATE TABLE IF NOT EXISTS assignment_files (
  assignment_id    text NOT NULL,
  file_id          text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  organization_id  text NOT NULL,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, file_id),
  FOREIGN KEY (organization_id, assignment_id)
    REFERENCES assignments (organization_id, id) ON DELETE CASCADE
);

/*
  The course library: textbooks, readings, slide decks, links.

  Attached to the course rather than a section, because the reading list is the
  same for every section of Physics 101 while the timetable is not — the same
  reason module content hangs off the course.

  A material is either a file or a link, never both, so a row cannot claim to
  be a PDF and a YouTube URL at once.
*/
CREATE TABLE IF NOT EXISTS course_materials (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  course_id        text NOT NULL,
  file_id          text REFERENCES files(id) ON DELETE CASCADE,
  url              text,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  -- ebook | document | slides | worksheet | video | link
  kind             text NOT NULL DEFAULT 'document',
  is_published     boolean NOT NULL DEFAULT false,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, course_id)
    REFERENCES courses (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT course_materials_file_or_link
    CHECK ((file_id IS NOT NULL AND url IS NULL) OR (file_id IS NULL AND url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_files_org           ON files (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_files    ON assignment_files (assignment_id, position);
CREATE INDEX IF NOT EXISTS idx_course_materials    ON course_materials (course_id, position);
CREATE INDEX IF NOT EXISTS idx_course_materials_pub
  ON course_materials (course_id) WHERE is_published;
`;
