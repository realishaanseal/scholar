import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  The two pieces of infrastructure an institution needs before this can go in
  front of real students. Both make trade-offs that are easy to get wrong
  silently, so the trade-offs themselves are what is pinned here.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const governance = code("src/lib/governance.ts");
const migration = code("src/lib/migrations/0010_governance.ts");

describe("the audit log records actions, not a second copy of student work", () => {
  it("clips every value it is handed", () => {
    // Without this, "record the grade change" becomes "keep a copy of every
    // piece of feedback in a table nobody thinks of as holding student work".
    expect(governance).toMatch(/slice\(0, 200\)/);
    expect(governance).toMatch(/n\+\+ >= 12/);
  });

  it("never lets a failed write break the request it describes", () => {
    // A teacher whose mark was saved must not see an error because the log
    // was briefly unavailable.
    const fn = governance.slice(
      governance.indexOf("export async function audit"),
      governance.indexOf("export type AuditEntry")
    );
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch/);
    expect(fn).not.toMatch(/throw/);
  });

  it("keeps a label so a deleted account still leaves a legible row", () => {
    expect(migration).toMatch(/actor_label/);
    expect(migration).toMatch(/actor_user_id\s+text REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it("is append-only in practice", () => {
    expect(governance).not.toMatch(/UPDATE audit_log/i);
    expect(governance).not.toMatch(/DELETE FROM audit_log/i);
  });
});

describe("the rate limiter", () => {
  it("counts and reads in one statement", () => {
    // Two simultaneous requests must not both read a stale count and both
    // decide they are under the limit.
    const fn = governance.slice(
      governance.indexOf("export async function rateLimit"),
      governance.indexOf("export async function enforceRate")
    );
    expect(fn).toMatch(/ON CONFLICT \(key\) DO UPDATE/);
    expect(fn).toMatch(/RETURNING count/);
    // One prepared statement, not a read followed by a write.
    expect((fn.match(/db\s*\n?\s*\.prepare/g) ?? []).length).toBe(1);
  });

  it("fails open rather than locking a school out", () => {
    // Refusing every teacher because a counter table is unavailable is worse
    // than admitting more traffic than intended.
    expect(governance).toMatch(/failing open/i);
    const fn = governance.slice(governance.indexOf("catch (err)"));
    expect(fn).toMatch(/allowed: true/);
  });

  it("resets a window rather than queueing behind it", () => {
    expect(governance).toMatch(/THEN 1/);
    expect(governance).toMatch(/window_start = CASE/);
  });
});

describe("a refused request is durable, not just a console line", () => {
  const guard = code("src/lib/api/guard.ts");

  it("writes the denial to the log", () => {
    // A console line is gone by the time anyone asks whether someone spent an
    // afternoon guessing at other people's work.
    expect(guard).toMatch(/action: "authz:denied"/);
  });

  it("still refuses without telling the caller why", () => {
    // Distinguishing "forbidden" from "not found" confirms the id was real.
    expect(guard).toMatch(/throw new Forbidden/);
  });
});

describe("429 is answerable by something automated", () => {
  const errors = code("src/lib/api/errors.ts");

  it("returns the status and the header a client already knows to read", () => {
    expect(errors).toMatch(/status: 429/);
    expect(errors).toMatch(/"retry-after"/);
  });
});
