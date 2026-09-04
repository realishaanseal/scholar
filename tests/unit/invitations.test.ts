import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  Onboarding is where an institution decides whether this product is usable.
  These pin the properties that make it safe rather than merely convenient.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const invitations = code("src/domains/identity/invitations.ts");
const migration = code("src/lib/migrations/0016_invitations.ts");
const signup = code("src/app/api/signup/route.ts");
const peopleRoute = code("src/app/api/institution/admin/people/route.ts");
const coursesRoute = code("src/app/api/institution/admin/courses/route.ts");

describe("a signup never fails because of an invitation", () => {
  it("swallows its own errors", () => {
    // The person has an account either way. Losing the account because a
    // membership could not be written would be far worse than an
    // administrator having to invite again.
    const fn = invitations.slice(invitations.indexOf("export async function acceptInvitationsFor"));
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch/);
    expect(fn).not.toMatch(/throw/);
  });

  it("runs at signup, not at first sign-in", () => {
    // So the very first page they see already has their courses on it.
    expect(signup).toMatch(/acceptInvitationsFor/);
  });
});

describe("an address is matched the way people type it", () => {
  it("normalises before storing and before looking up", () => {
    // An invitation that misses because of a capital letter is
    // indistinguishable from one that was never sent.
    expect(invitations).toMatch(/toLowerCase\(\)/);
    const accept = invitations.slice(invitations.indexOf("export async function acceptInvitationsFor"));
    expect(accept).toMatch(/normalise\(email\)/);
  });

  it("applies every institution's invitation, not just the first", () => {
    // A teacher can work at two schools; picking one arbitrarily would strand
    // the other with no way to notice.
    const accept = invitations.slice(invitations.indexOf("export async function acceptInvitationsFor"));
    expect(accept).toMatch(/for \(const r of rows/);
    expect(accept).not.toMatch(/LIMIT 1/);
  });
});

describe("re-inviting corrects rather than duplicates", () => {
  it("has one pending invitation per address per institution", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*?invitations\(organization_id, email\)/);
    expect(migration).toMatch(/WHERE accepted_at IS NULL/);
  });

  it("updates on conflict instead of inserting a second row", () => {
    // Two pending invitations for one address would be accepted twice.
    expect(invitations).toMatch(/ON CONFLICT[\s\S]{0,80}DO UPDATE/);
  });
});

describe("what an invitation can grant", () => {
  it("only grants roles the schema recognises", () => {
    expect(migration).toMatch(/CHECK \(role IN \(/);
  });

  it("reads the section according to what they were invited as", () => {
    // The same field means "teaches this" for a teacher and "is in this" for
    // a student, and getting it backwards puts a child in a staff list.
    const accept = invitations.slice(invitations.indexOf("export async function acceptInvitationsFor"));
    expect(accept).toMatch(/role === "TEACHER"/);
    expect(accept).toMatch(/INSERT INTO section_teachers/);
    expect(accept).toMatch(/INSERT INTO enrollments/);
  });

  it("carries no token in a link", () => {
    // Scholar has no mail infrastructure, and a guessable token posted to a
    // school address is a way into an institution's data. Matching on an
    // address the person proves they control by registering is weaker in
    // theory and much harder to get wrong.
    expect(migration).not.toMatch(/token/i);
    expect(invitations).not.toMatch(/\btoken\b/i);
  });
});

describe("the console is guarded like everything else", () => {
  it("requires the right permission to create a course", () => {
    expect(coursesRoute).toMatch(/permission: "organization:manage"/);
  });

  it("requires the right permission to add people", () => {
    expect(peopleRoute).toMatch(/permission: "member:manage"/);
  });

  it("never takes the organization from the request", () => {
    // The tenant comes from who is asking, not from what they sent.
    for (const r of [coursesRoute, peopleRoute]) {
      expect(r).not.toMatch(/params\.organizationId/);
      expect(r).toMatch(/scopeOfAdministeredOrg/);
    }
  });

  it("caps how many addresses one request can carry", () => {
    // Paste-a-spreadsheet is the intended input; paste-a-database is not.
    expect(peopleRoute).toMatch(/\.slice\(0, \d+\)/);
  });
});
