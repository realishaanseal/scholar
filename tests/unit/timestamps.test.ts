import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
  The conversion of the legacy TEXT date columns is the single most dangerous
  change in this codebase: a value that shifts by an hour produces a student
  marked late for work they handed in on time, and fixing the bug afterwards
  does not give them that back. The discipline that makes it safe is
  expand → verify → swap → contract, in separate releases, and these tests
  exist so a later change cannot quietly collapse those steps into one.
*/

const MIGRATIONS = join(process.cwd(), "src/lib/migrations");
const expand = readFileSync(join(MIGRATIONS, "0012_timestamps_expand.ts"), "utf8");
const dualWrite = readFileSync(join(MIGRATIONS, "0013_timestamps_dualwrite.ts"), "utf8");

describe("the expand migration only expands", () => {
  it("drops nothing", () => {
    // The whole safety property. A DROP here would make the release
    // irreversible and would do it in the same deploy that created the
    // replacement.
    expect(expand).not.toMatch(/DROP\s+COLUMN/i);
    expect(expand).not.toMatch(/DROP\s+TABLE/i);
    expect(expand).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+TYPE/i);
  });

  it("adds every new column as nullable", () => {
    // A NOT NULL on a column being backfilled would fail the migration on any
    // table with a single null in its source column.
    const adds = expand.match(/ADD COLUMN IF NOT EXISTS[^,;]+/g) ?? [];
    expect(adds.length).toBeGreaterThan(10);
    for (const a of adds) expect(a).not.toMatch(/NOT NULL/i);
  });

  it("leaves the auth adapter's columns alone", () => {
    // Auth.js owns the shapes it defined; converting them is a separate
    // concern with a separate blast radius.
    expect(expand).not.toMatch(/ALTER TABLE sessions/i);
    expect(expand).not.toMatch(/ALTER TABLE accounts/i);
    expect(expand).not.toMatch(/ALTER TABLE verification_tokens/i);
  });

  it("backfills without overwriting an already-converted row", () => {
    // Re-running must be a no-op rather than a second pass over live data.
    const updates = expand.match(/UPDATE \w+ SET[\s\S]*?;/g) ?? [];
    expect(updates.length).toBeGreaterThan(5);
    for (const u of updates) expect(u).toMatch(/WHERE[\s\S]*IS NULL/i);
  });
});

describe("nothing reads the new columns yet", () => {
  const sources: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) sources.push(p);
    }
  })(join(process.cwd(), "src"));

  it("keeps reads on the text columns until a later release", () => {
    // Swapping reads is the step that needs evidence from the verification
    // script against real data. Doing it in the same release as the expand
    // would mean shipping the conversion and depending on it at once.
    const offenders = sources
      .filter((f) => !f.includes("migrations"))
      .filter((f) => /\b(due_at_tz|created_at_tz|completed_at_tz|updated_at_tz)\b/.test(
        readFileSync(f, "utf8")
      ));
    expect(offenders, `these read the new columns too early: ${offenders.join(", ")}`)
      .toEqual([]);
  });
});

describe("the two copies cannot drift apart", () => {
  it("syncs on update as well as insert", () => {
    // An INSERT-only trigger would let a changed deadline leave a stale
    // timestamptz behind it, which is worse than a null: it looks converted.
    expect(dualWrite).toMatch(/BEFORE INSERT OR UPDATE/);
    const triggers = dualWrite.match(/CREATE TRIGGER[\s\S]*?;/g) ?? [];
    expect(triggers.length).toBeGreaterThan(10);
    for (const t of triggers) expect(t).toMatch(/BEFORE INSERT OR UPDATE/);
  });

  it("treats the text column as the source of truth", () => {
    // One direction only. Making the new column authoritative before anything
    // reads it would mean the swap changed two things at once.
    expect(dualWrite).toMatch(/sync_iso_text_to_tz/);
    expect(dualWrite).not.toMatch(/sync_tz_to_text/);
  });

  it("covers every table the expand migration touched", () => {
    const expanded = new Set(
      [...expand.matchAll(/ALTER TABLE (\w+)/g)].map((m) => m[1])
    );
    const triggered = new Set(
      [...dualWrite.matchAll(/CREATE TRIGGER \w+\s+BEFORE INSERT OR UPDATE ON (\w+)/g)]
        .map((m) => m[1])
    );
    for (const t of expanded) {
      expect(triggered.has(t), `${t} was expanded but has no dual-write trigger`).toBe(true);
    }
  });
});
