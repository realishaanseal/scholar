import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  Data rights are the part of this system with a statutory clock attached —
  one month, under the GDPR and the UK GDPR — and the part where getting it
  wrong is a regulatory matter rather than a bug report. These pin the
  properties that make the implementation defensible.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const privacy = code("src/domains/privacy/index.ts");
const exportRoute = code("src/app/api/privacy/export/route.ts");
const draftRoute = code(
  "src/app/api/institution/submissions/[submissionId]/draft/route.ts"
);
const migration = code("src/lib/migrations/0015_ai_policy.ts");

describe("a subject access request answers about the caller and nobody else", () => {
  it("takes no id from the request", () => {
    // An export endpoint that accepts a user id is an endpoint that can be
    // pointed at a classmate.
    expect(exportRoute).not.toMatch(/params\.\w*[Uu]serId/);
    expect(exportRoute).not.toMatch(/searchParams\.get/);
    expect(exportRoute).toMatch(/personalRoute/);
  });

  it("is never cached", () => {
    // The most personal payload the application produces.
    expect(exportRoute).toMatch(/no-store/);
  });

  it("returns rows rather than a summary", () => {
    // A summary is an interpretation, and it omits whatever the person
    // writing it did not think mattered — often the part being asked about.
    expect(privacy).toMatch(/SELECT \* FROM/);
  });
});

describe("erasure removes the person without removing the record", () => {
  it("clears the denormalised label the foreign keys cannot reach", () => {
    // actor_label exists so a departed account leaves a legible row. After an
    // erasure it is exactly the identifying data that was supposed to go.
    expect(privacy).toMatch(/UPDATE audit_log SET actor_label/);
  });

  it("clears that label before deleting the row it belongs to", () => {
    const fn = privacy.slice(privacy.indexOf("export async function erasePerson"));
    expect(fn.indexOf("actor_label")).toBeLessThan(fn.indexOf("DELETE FROM users"));
  });

  it("never deletes from the audit tables directly", () => {
    // The record that something happened survives. Only the identity goes.
    expect(privacy).not.toMatch(/DELETE FROM audit_log/i);
    expect(privacy).not.toMatch(/DELETE FROM grade_events/i);
  });

  it("can say what it will do before it does it", () => {
    // The consequences are not symmetrical and some are irreversible.
    expect(privacy).toMatch(/export async function previewErasure/);
    expect(privacy).toMatch(/warnings/);
  });

  it("warns about coursework an institution may be obliged to keep", () => {
    // Article 17 and a retention obligation genuinely conflict, and that is
    // not a conflict this tool should resolve silently.
    // Matched on a fragment that is not split across string literals: the
    // sentence is concatenated in the source, so a phrase spanning the join
    // would never match however correct the code is.
    expect(privacy).toMatch(/obliged to retain|required to retain/i);
    expect(privacy).toMatch(/export them before erasing/i);
  });
});

describe("where student work goes is the institution's decision", () => {
  it("defaults to sending it nowhere", () => {
    // A school that has not made this decision has not implicitly made it.
    expect(migration).toMatch(/DEFAULT 'off'/);
  });

  it("checks the policy on the server, not in the interface", () => {
    // A hidden button is a courtesy, not a rule.
    expect(draftRoute).toMatch(/aiPolicy === "off"/);
    expect(draftRoute).toMatch(/getOrganizationTime/);
  });

  it("refuses before spending anything", () => {
    // The policy check comes before the rate limit and before the model call,
    // so a disabled institution cannot be billed for a refused request.
    // Against the call sites, not the imports — `enforceRate` appears at the
    // top of the file as an import, and comparing against that would pass or
    // fail for reasons unrelated to the order things actually happen in.
    const i = draftRoute.indexOf('aiPolicy === "off"');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(draftRoute.indexOf("await enforceRate("));
    expect(i).toBeLessThan(draftRoute.indexOf("await draftMark("));
  });

  it("constrains the column to the three answers that exist", () => {
    expect(migration).toMatch(/CHECK \(ai_policy IN \('off', 'institution', 'teacher'\)\)/);
  });
});
