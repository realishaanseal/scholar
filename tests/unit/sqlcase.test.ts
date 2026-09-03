import { describe, it, expect } from "vitest";
import { quoteCamelIdentifiers as q } from "@/lib/sqlCase";
import { MIGRATIONS } from "@/lib/migrations";

/*
  This function rewrites every query on its way to the database, so a mistake
  in it is a mistake in all of them. The previous version was one regex over
  the whole statement and could not tell an identifier from text that looked
  like one — which meant a camelCase string literal was silently corrupted on
  the way into the database, and a hand-quoted identifier came out doubled.
*/

describe("identifiers", () => {
  it("quotes a legacy camelCase column", () => {
    expect(q("SELECT userId FROM homework")).toBe('SELECT "userId" FROM homework');
  });

  it("leaves keywords and snake_case alone", () => {
    const sql = "SELECT organization_id FROM course_sections WHERE id = $1";
    expect(q(sql)).toBe(sql);
  });

  it("leaves all-caps alone, so EXCLUDED and SELECT survive", () => {
    expect(q("DO UPDATE SET dueAt = EXCLUDED.dueAt")).toBe(
      'DO UPDATE SET "dueAt" = EXCLUDED."dueAt"'
    );
  });

  it("handles a qualified column", () => {
    expect(q("SELECT h.dueAt FROM homework h")).toBe('SELECT h."dueAt" FROM homework h');
  });
});

describe("string literals are data, not code", () => {
  it("does not touch a camelCase value inside a literal", () => {
    // The bug that mattered: this used to write 'lms:"assignmentDraft"' into
    // the database, silently, and nothing would notice until a read failed.
    expect(q("WHERE externalSource = 'lms:assignmentDraft'")).toBe(
      `WHERE "externalSource" = 'lms:assignmentDraft'`
    );
  });

  it("survives an escaped quote inside a literal", () => {
    expect(q("SET title = 'it''s dueAt noon' WHERE userId = $1")).toBe(
      `SET title = 'it''s dueAt noon' WHERE "userId" = $1`
    );
  });

  it("keeps quoting identifiers after a literal ends", () => {
    expect(q("WHERE status = 'active' AND userId = $1")).toBe(
      `WHERE status = 'active' AND "userId" = $1`
    );
  });

  it("leaves a dollar-quoted body alone", () => {
    expect(q("DO $$ BEGIN camelCase; END $$")).toBe("DO $$ BEGIN camelCase; END $$");
  });
});

describe("already-quoted identifiers", () => {
  it("does not double-quote them", () => {
    // The mistake I made writing the assignment projection: hand-quoting plus
    // this function produced ""userId"" and a syntax error.
    expect(q('SELECT "userId" FROM homework')).toBe('SELECT "userId" FROM homework');
    expect(q('SELECT "userId" FROM homework')).not.toContain('""');
  });

  it("mixes quoted and unquoted correctly", () => {
    expect(q('SELECT "userId", dueAt FROM homework')).toBe(
      'SELECT "userId", "dueAt" FROM homework'
    );
  });
});

describe("comments", () => {
  it("leaves a line comment untouched", () => {
    expect(q("SELECT 1 -- rename dueAt later\nFROM homework")).toBe(
      "SELECT 1 -- rename dueAt later\nFROM homework"
    );
  });

  it("leaves a block comment untouched, including nested ones", () => {
    const sql = "/* outer /* inner dueAt */ still */ SELECT userId";
    expect(q(sql)).toBe('/* outer /* inner dueAt */ still */ SELECT "userId"');
  });
});

describe("the baseline still round-trips", () => {
  it("quotes the legacy schema without corrupting it", () => {
    // The real payload this exists for. If the lexer breaks on any construct
    // in the baseline, every fresh database is broken.
    const baseline = MIGRATIONS.find((m) => m.id === "0001_baseline")!;
    const out = q(baseline.sql);

    expect(out).toContain('"userId"');
    expect(out).toContain('"dueAt"');
    expect(out).not.toContain('""');
    // Table names are snake_case and must survive untouched.
    expect(out).toContain("CREATE TABLE IF NOT EXISTS homework");
    // Applying it twice must be a no-op, which is only true if quoted
    // identifiers are passed through.
    expect(q(out)).toBe(out);
  });

  it("leaves the snake_case migrations completely unchanged", () => {
    // They never run through the shim in production, but if one ever did it
    // must be a no-op rather than a corruption.
    for (const m of MIGRATIONS.filter((x) => x.id !== "0001_baseline")) {
      expect(q(m.sql)).toBe(m.sql);
    }
  });
});

describe("idempotence", () => {
  it("running twice changes nothing the second time", () => {
    const once = q("SELECT userId, dueAt FROM homework WHERE source = 'lms'");
    expect(q(once)).toBe(once);
  });
});

/* ── Narrowed to columns that actually exist ───────────────────────────── */

describe("only real legacy columns are quoted", () => {
  it("quotes a column the schema genuinely has", () => {
    expect(q(`SELECT "x" FROM t WHERE userId = ?`))
      .toContain('"userId"');
    expect(q(`SELECT dueAt FROM homework`)).toContain('"dueAt"');
  });

  it("leaves a mixed-case token that is not a column alone", () => {
    // Defence in depth behind the lexer. Even if the string-tracking below
    // had a bug, an unknown token cannot be rewritten — so a value can no
    // longer be corrupted into an identifier.
    const sql = `SELECT * FROM t WHERE name = 'MathCore' AND kind = 'InProgress'`;
    expect(q(sql)).toBe(sql);
  });

  it("does not quote a plausible-looking name that was never a column", () => {
    const sql = `SELECT someInventedThing FROM t`;
    expect(q(sql)).toBe(sql);
  });

  it("leaves snake_case entirely alone", () => {
    const sql = `SELECT organization_id, course_section_id FROM assignments`;
    expect(q(sql)).toBe(sql);
  });

  it("fails loudly rather than silently when a column is missed", () => {
    // A legacy column absent from the allow-list produces
    // `column "userid" does not exist` at query time — immediate and
    // obvious. The behaviour being replaced failed by writing a wrong value
    // and saying nothing, which is the direction that matters.
    const sql = `SELECT notARealColumn FROM t`;
    expect(q(sql)).not.toContain('"');
  });
});
