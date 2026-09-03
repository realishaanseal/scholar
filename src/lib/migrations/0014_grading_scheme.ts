/**
 * 0014 — how this institution writes a grade down.
 *
 * Scholar computed a percentage and showed a percentage. That was one
 * country's convention presented as though it were neutral: it is the British
 * and Indian answer, and it is not the German, French or IB one. A German
 * Gymnasium reading "78%" has been handed a number its teachers do not use
 * and its parents do not recognise.
 *
 * The arithmetic does not move. courseGrade() still produces a normalised
 * percentage from marks and weights, and that stays the record of what
 * happened. This column decides only how it is written and, crucially, which
 * direction counts as better — because the German scale runs 1 (best) to 6
 * (worst), and every sort and colour scale that assumed bigger-is-better was
 * silently wrong for it.
 */
export const sql = `
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS grading_scheme text NOT NULL DEFAULT 'percent';
`;
