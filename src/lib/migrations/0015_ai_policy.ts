/**
 * 0015 — who decides where student work is sent.
 *
 * Phase 8 gave teachers a marking assistant. It resolves its provider from the
 * teacher's own settings, which means an institution cannot say — cannot even
 * discover — which company is receiving its students' coursework, and cannot
 * stop it changing when one teacher edits a preference.
 *
 * For a school in the EU that is not a configuration gap, it is a processor
 * relationship nobody has a contract for. Under the UK's Age Appropriate
 * Design Code and India's DPDP Act it is minors' data going to a third party
 * on a default nobody chose.
 *
 * So the institution decides, and the default is off. A school that has not
 * made this decision has not implicitly made it — which is the opposite of
 * what a default-on toggle would mean, and the reason this column defaults to
 * the most restrictive value rather than the most useful one.
 *
 *   off          No AI assistance anywhere in the institution.
 *   institution  The institution's own provider, for everyone.
 *   teacher      Teachers may use their own settings.
 */
export const sql = `
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_policy text NOT NULL DEFAULT 'off';

ALTER TABLE organizations
  ADD CONSTRAINT organizations_ai_policy_known
  CHECK (ai_policy IN ('off', 'institution', 'teacher'))
  NOT VALID;
`;
