import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  A guardian link is a claim about a family, made by a school, about a child.
  Getting it wrong means showing one family another family's data, and there
  is no version of that which an apology recovers. These pin the boundaries.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const guardians = code("src/domains/guardians/index.ts");
const migration = code("src/lib/migrations/0022_guardians.ts");
const route = code("src/app/api/guardian/children/[studentId]/route.ts");
const policy = code("src/lib/authz/policy.ts");
const permissions = code("src/lib/authz/permissions.ts");

describe("a guardian sees their own child and nothing else", () => {
  it("refuses a check that names no child", () => {
    // A guardian's reach is defined entirely by which child is named, so a
    // question asked in general is not a question they may ask.
    expect(policy).toMatch(/guardian access requires naming a student/);
  });

  it("checks the named child against their own", () => {
    expect(policy).toMatch(/actor\.guardianOf \?\? \[\]\)\.includes\(scope\.studentUserId\)/);
  });

  it("holds only read permissions", () => {
    const block = permissions.slice(
      permissions.indexOf("PARENT: ["),
      permissions.indexOf("COUNSELOR:")
    );
    for (const write of ["grade:modify", "assignment:grade", "assignment:create", "member:manage"]) {
      expect(block, `PARENT must not hold ${write}`).not.toContain(write);
    }
  });
});

describe("the school asserts the relationship", () => {
  it("records who asserted it", () => {
    // Proving control of an email address is not the same as being a child's
    // guardian, and the school is the only party positioned to know.
    expect(migration).toMatch(/added_by/);
    expect(migration).toMatch(/added_by_label/);
  });

  it("revokes rather than deletes", () => {
    // Family arrangements change, sometimes because a court decided they
    // should, and a school has to be able to say when access ended.
    expect(migration).toMatch(/revoked_at/);
    expect(guardians).toMatch(/SET revoked_at = now\(\)/);
    expect(guardians).not.toMatch(/DELETE FROM guardian_links/);
  });

  it("grants nothing through a revoked link", () => {
    expect(guardians).toMatch(/revoked_at IS NULL/);
  });

  it("refuses somebody being their own guardian", () => {
    expect(migration).toMatch(/CHECK \(guardian_user_id <> student_user_id\)/);
    expect(guardians).toMatch(/cannot be their own guardian/);
  });
});

describe("the personal layer is not a school's to hand on", () => {
  it("names no personal table", () => {
    // Scholar knows when a child studies, for how long, and what they
    // planned. A parent is not an administrator of their child.
    for (const t of ["homework", "task_events", "academic_profile", "timetable",
                     "focusSeconds", "dismissed_signals", "study_sessions"]) {
      expect(guardians, `guardians must not read ${t}`).not.toMatch(new RegExp(`\b${t}\b`));
    }
  });

  it("shapes the digest so nothing personal can be added by accident", () => {
    expect(guardians).toMatch(/export type GuardianDigest/);
    expect(guardians).not.toMatch(/estimateMins|focus|pace|calibrat/i);
  });

  it("shows only marks the teacher has released", () => {
    // Finding out your grade because your mother mentioned it over dinner is
    // a specific and avoidable indignity.
    expect(guardians).toMatch(/posted_at/);
  });

  it("logs every read", () => {
    // Legitimate and unremarkable, and still access to a minor's record.
    expect(route).toMatch(/guardian:read/);
  });
});

describe("a child may know who reads about them", () => {
  it("exposes their guardians to the student themselves", () => {
    expect(guardians).toMatch(/export async function guardiansOf/);
    expect(code("src/app/api/privacy/guardians/route.ts")).toMatch(/personalRoute/);
  });

  it("names the member of staff who asserted each link", () => {
    // A student who believes one is wrong needs to know who to ask.
    expect(guardians).toMatch(/addedByLabel/);
  });
});
