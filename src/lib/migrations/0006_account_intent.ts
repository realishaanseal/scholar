/**
 * 0006 — what someone said they were here to do.
 *
 * Signup now asks whether you are a student, a teacher or an administrator,
 * and this records the answer.
 *
 * It is emphatically NOT a role. Roles live in organization_memberships and
 * are granted by an institution; if picking "Teacher" on a signup form granted
 * teaching rights, anyone could mint them for themselves, and every
 * permission check in the application would be decorative. Nothing reads this
 * column to make an authorization decision, and a test asserts as much.
 *
 * What it is good for: shaping onboarding, and giving an administrator a list
 * of people who signed up expecting to teach and are still waiting to be added
 * to something.
 *
 * snake_case among camelCase neighbours, like homework.archived_at, so this
 * migration stays clear of the regex quoting shim.
 */
export const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_intent text;

-- Small and low-cardinality, but the admin question "who is waiting to be
-- given access" reads exactly this.
CREATE INDEX IF NOT EXISTS idx_users_account_intent
  ON users (account_intent) WHERE account_intent IS NOT NULL;
`;
