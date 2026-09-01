/**
 * Postgres folds every UNQUOTED identifier to lowercase — both when creating
 * a column and when returning it in a result row. Every table in this schema
 * was named snake_case (unaffected), but the COLUMNS are camelCase
 * (`userId`, `dueAt`, `subjectName`, ...) to match the original SQLite
 * database, where identifiers keep whatever case you write. Left alone,
 * "userId" would silently become "userid" everywhere — a working query that
 * returns a row with no `.userId` property on it, only `.userid`.
 *
 * Rather than manually double-quoting every identifier across every query
 * string in the codebase, this wraps any genuinely mixed-case token (has
 * both an uppercase and a lowercase letter) in double quotes wherever it
 * appears — in CREATE TABLE, SELECT lists, WHERE clauses, ON CONFLICT
 * targets, aliases, all of it — which tells Postgres to preserve that exact
 * case rather than fold it. SQL keywords (SELECT, FROM, ON CONFLICT, ...)
 * and this codebase's snake_case table names are all single-case, so they
 * never match and pass through untouched. (This does not attempt to spare
 * mixed-case text inside quoted string literals — there aren't any in this
 * schema's SQL; a future literal with camelCase text would need its own
 * escaping.)
 */
export function quoteCamelIdentifiers(sql: string): string {
  return sql.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (token) =>
    /[A-Z]/.test(token) && /[a-z]/.test(token) ? `"${token}"` : token
  );
}


