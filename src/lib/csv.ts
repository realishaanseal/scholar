/**
 * CSV, written the way spreadsheets actually read it.
 *
 * Teachers live in spreadsheets and will not stop. Refusing to export is not
 * a principled stand about owning the data — it is a hostage situation, and
 * it is the first thing an evaluator tests.
 *
 * Two details that are the difference between a file that opens and one that
 * produces a support ticket:
 *
 * A leading BOM, because Excel on Windows assumes the system codepage
 * otherwise and turns every non-ASCII name into mojibake. A gradebook of
 * Hindi or German names is exactly where that shows.
 *
 * A field beginning with =, +, - or @ is prefixed with a quote. Excel treats
 * those as formulas, so a student named "-Ali" or a comment starting with "="
 * becomes executable content in somebody else's spreadsheet. This is a real
 * injection class with a real CVE history, and the fix costs one line.
 */

const RISKY_PREFIX = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);

  // Formula injection: neutralised by making the cell unambiguously text.
  if (RISKY_PREFIX.test(s)) s = `'${s}`;

  // Quote when the value contains anything that would otherwise end the field.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  // \r\n rather than \n: Excel is the reader, and it is the one that cares.
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Parse a CSV back.
 *
 * Deliberately small and forgiving rather than complete: it handles quoted
 * fields, doubled quotes and both line endings, which is everything a
 * spreadsheet emits. It is not a general parser and should not grow into one
 * — an import that silently misreads a grade is worse than one that refuses.
 */
export function fromCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A BOM on the way in is somebody's export coming home.
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }

  // A trailing newline produces one empty row, which is not a record.
  return out.filter((r) => r.some((v) => v.trim() !== ""));
}
