/**
 * 0018 — telling people things, and choosing when they hear it.
 *
 * Two gaps that are small to build and conspicuous to lack.
 *
 * A teacher had no way to tell a class anything. Not a minor omission — a
 * missing organ. Every competitor has had announcements since the 1990s, and
 * an evaluation ends the moment somebody notices there are none.
 *
 * And a mark became visible the instant it was written. Marking thirty papers
 * takes days, so students received them as a trickle and compared, which is
 * the specific thing teachers ask for and Canvas built a whole posting-policy
 * layer around. A teacher should be able to mark a pile over a week and
 * release it at once.
 *
 * No email in either. Scholar has no mail infrastructure, and a delivery
 * system that silently fails is worse than none — an announcement that a
 * teacher believes was sent and a student never saw is worse than no
 * announcement at all. Both live in the product, where the audience already
 * is.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS announcements (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  -- Null means the whole institution. A head of year telling everyone about
  -- an inset day is the same object as a teacher telling one class about a
  -- room change, and modelling them separately would mean two of everything.
  course_section_id text,
  title             text NOT NULL,
  body              text NOT NULL DEFAULT '',
  created_by        text REFERENCES users(id) ON DELETE SET NULL,
  -- Kept beside the id so a departed teacher's announcement stays legible
  -- rather than becoming anonymous, exactly as in the audit log.
  author_label      text NOT NULL DEFAULT '',
  -- Deliberately nullable: an announcement can be written now and posted
  -- later, which is how anyone writes anything they care about getting right.
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_announcements_section
  ON announcements(course_section_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_org
  ON announcements(organization_id, published_at DESC);

/*
  When a mark becomes visible.

  'automatic' is the behaviour that already existed and stays the default:
  most work is marked one piece at a time and there is nothing to hold back.
  'manual' hides marks until the teacher posts them.
*/
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS grade_posting text NOT NULL DEFAULT 'automatic';

ALTER TABLE assignments
  ADD CONSTRAINT assignments_grade_posting_known
  CHECK (grade_posting IN ('automatic', 'manual'))
  NOT VALID;

/*
  Per submission, because releasing a whole assignment at once and releasing
  one student's early are both things teachers do — the second usually for a
  child who has been waiting on an access arrangement.

  Backfilled to graded_at so nothing already returned becomes invisible. A
  migration that hid marks students had already seen would be the worst
  possible way to introduce this.
*/
ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

UPDATE assignment_submissions
   SET posted_at = graded_at
 WHERE posted_at IS NULL AND graded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_posted
  ON assignment_submissions(assignment_id, posted_at);
`;
