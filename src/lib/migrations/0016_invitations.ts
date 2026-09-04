/**
 * 0016 — inviting somebody who has not signed up yet.
 *
 * The setup script could only link people who already had an account, which
 * meant an institution could not onboard a class: thirty students have to
 * each register before anyone can be enrolled, and nobody can tell them what
 * to register for because the course does not exist until they have.
 *
 * An invitation breaks that circle. An administrator names an email address
 * and a role; when somebody signs up with that address the membership is
 * created for them. Until then the invitation sits here, visible on the
 * people screen, so an administrator can see who has not joined yet rather
 * than wondering whether they typed the address wrong.
 *
 * Matched on lowercased email because that is how people actually type their
 * own address, and an invitation that fails to match because of a capital
 * letter is indistinguishable from one that was never sent.
 *
 * Deliberately not a token in a link. A guessable-in-principle token mailed
 * to a school address is a way into an institution's data, and Scholar has no
 * mail infrastructure to send one properly. Matching on the address the person
 * proves they control by registering is weaker in theory and much harder to
 * get wrong in practice.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS invitations (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  -- Stored lowercased; the unique index below depends on it.
  email            text NOT NULL,
  role             text NOT NULL,
  -- Optional: enrol into this section on acceptance, so inviting a class and
  -- building its roster are one action rather than two.
  course_section_id text,
  invited_by       text REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  accepted_user_id text REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT invitations_role_known CHECK (role IN (
    'STUDENT', 'TEACHER', 'TEACHING_ASSISTANT',
    'DEPARTMENT_ADMIN', 'INSTITUTION_ADMIN'
  ))
);

-- One outstanding invitation per address per institution. Re-inviting someone
-- should update the invitation rather than create a second one that will be
-- accepted twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending
  ON invitations(organization_id, email)
  WHERE accepted_at IS NULL;

-- The lookup that runs on every signup, so it must not be a scan.
CREATE INDEX IF NOT EXISTS idx_invitations_email
  ON invitations(email) WHERE accepted_at IS NULL;
`;
