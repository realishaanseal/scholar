import { describe, it, expect } from "vitest";
import { fromCsv, toCsv } from "@/lib/csv";

describe("a CSV a spreadsheet can actually open", () => {
  it("starts with a BOM so Excel reads it as UTF-8", () => {
    // Without it Excel on Windows assumes the system codepage and turns every
    // non-ASCII name into mojibake — which is exactly the gradebook case.
    expect(toCsv([["नाम"]]).startsWith("\uFEFF")).toBe(true);
  });

  it("preserves names in other scripts", () => {
    const csv = toCsv([["Müller"], ["आरव"], ["李"]]);
    expect(csv).toContain("Müller");
    expect(csv).toContain("आरव");
    expect(csv).toContain("李");
  });

  it("quotes fields containing commas, quotes or newlines", () => {
    expect(toCsv([['a,b']])).toContain('"a,b"');
    expect(toCsv([['say "hi"']])).toContain('"say ""hi"""');
    expect(toCsv([["two\nlines"]])).toContain('"two\nlines"');
  });

  it("uses CRLF, because Excel is the reader that cares", () => {
    expect(toCsv([["a"], ["b"]])).toContain("\r\n");
  });
});

describe("a cell cannot become a formula in somebody else's spreadsheet", () => {
  it("neutralises every dangerous prefix", () => {
    // A real injection class with a real CVE history: a student named "-Ali"
    // or a comment starting with "=" becomes executable content when the
    // office opens the export.
    for (const risky of ["=1+1", "+cmd", "-Ali", "@SUM(A1)"]) {
      const csv = toCsv([[risky]]);
      expect(csv, `${risky} was not neutralised`).toContain(`'${risky}`);
    }
  });

  it("leaves an ordinary value alone", () => {
    expect(toCsv([["Aisha"], ["17.5"]])).not.toContain("'");
  });
});

describe("reading one back", () => {
  it("round-trips values that needed quoting", () => {
    const rows = [["name", "comment"], ["Ali", 'said "yes", then left']];
    expect(fromCsv(toCsv(rows))).toEqual(rows);
  });

  it("handles both line endings", () => {
    expect(fromCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(fromCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("swallows a BOM on the way in", () => {
    expect(fromCsv("\uFEFFa,b")).toEqual([["a", "b"]]);
  });

  it("drops a trailing blank line rather than reporting an empty record", () => {
    expect(fromCsv("a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("keeps an empty cell in the middle of a row", () => {
    expect(fromCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});
