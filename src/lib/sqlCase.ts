/**
 * Postgres folds every UNQUOTED identifier to lowercase — both when creating a
 * column and when returning it in a result row. Every table in this schema is
 * snake_case (unaffected), but the legacy COLUMNS are camelCase (`userId`,
 * `dueAt`, `subjectName`, ...) to match the original SQLite database, where
 * identifiers keep whatever case you write. Left alone, `userId` would silently
 * become `userid` — a working query returning a row with no `.userId` on it.
 *
 * Rather than hand-quoting every identifier in every query, this wraps any
 * genuinely mixed-case token in double quotes wherever it appears.
 *
 * It is a lexer rather than a regex, and that is the point. The previous
 * version was a single `String.replace` over the whole statement, which could
 * not tell an identifier from text that merely looked like one:
 *
 *   'lms:assignmentDraft'  →  'lms:"assignmentDraft"'   corrupted data
 *   "userId"               →  ""userId""                syntax error
 *   -- rename dueAt later  →  -- rename "dueAt" later   harmless, but noise
 *
 * The first of those writes wrong values to the database and is silent about
 * it. The second is the mistake I actually made while writing the assignment
 * projection. So the scanner below tracks whether it is inside a string, an
 * already-quoted identifier, a comment or a dollar-quoted block, and rewrites
 * only in ordinary code.
 *
 * New tables are snake_case precisely so none of this applies to them. This
 * exists for the legacy tables and should not grow.
 */
export function quoteCamelIdentifiers(sql: string): string {
  let out = "";
  let i = 0;

  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comment: -- to end of line.
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment. Postgres nests these, so depth is tracked rather than
    // stopping at the first */.
    if (c === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Single-quoted string. '' is an escaped quote, not a terminator.
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") { j++; break; }
        else j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Already-quoted identifier. Passed through verbatim so hand-quoting and
    // this function cannot both apply and produce ""userId"".
    if (c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') { j++; break; }
        else j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted string: $$...$$ or $tag$...$tag$, used by function bodies
    // where a literal may itself contain quotes.
    if (c === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = sql.indexOf(marker, i + marker.length);
        const stop = end === -1 ? sql.length : end + marker.length;
        out += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    // An identifier, or something that looks like one.
    if (isIdentStart(c)) {
      let j = i;
      while (j < sql.length && isIdentPart(sql[j])) j++;
      const token = sql.slice(i, j);

      // Mixed case is the signal that this is a legacy camelCase column.
      // Keywords and snake_case names are single-case and pass through.
      out += /[A-Z]/.test(token) && /[a-z]/.test(token) ? `"${token}"` : token;
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}
