import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  An extension request is the one place a personal-layer number crosses into an
  institutional object. It is defensible because the student sends it, about
  themselves, for a decision they asked for. These pin how narrow that crossing
  stays.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const migration = code("src/lib/migrations/0023_extension_requests.ts");
const domain = code("src/domains/assessment/extensions.ts");
const route = code("src/app/api/institution/assignments/[assignmentId]/extension/route.ts");
const queue = code("src/components/teach/ExtensionQueue.tsx");

const boundary = (t: string) => new RegExp(String.raw`\b` + t + String.raw`\b`);

describe("what a teacher receives", () => {
  it("carries two totals and a message, and nothing else about the student", () => {
    // A teacher deciding on an extension needs to know the ask is real. They
    // do not need a file on the person making it.
    for (const t of ["homework", "task_events", "academic_profile", "timetable",
                     "focusSeconds", "study_sessions", "dismissed_signals"]) {
      expect(domain, `extensions must not read ${t}`).not.toMatch(boundary(t));
      expect(migration, `the table must not reference ${t}`).not.toMatch(boundary(t));
    }
  });

  it("stores the figures rather than recomputing them", () => {
    // A number that moves while somebody decides on it is not evidence.
    expect(migration).toMatch(/work_mins\s+integer NOT NULL/);
    expect(migration).toMatch(/available_mins\s+integer NOT NULL/);
    expect(domain).not.toMatch(/UPDATE extension_requests[\s\S]{0,200}work_mins/);
  });
});

describe("the shape of a decision", () => {
  it("keeps a refused request rather than deleting it", () => {
    // "I asked and never heard back" and "I was refused" are different
    // complaints and a school must be able to tell them apart.
    expect(migration).toMatch(/status IN \('pending', 'granted', 'declined', 'withdrawn'\)/);
    expect(migration).toMatch(/decided_by/);
    expect(migration).toMatch(/decided_at/);
    expect(domain).not.toMatch(/DELETE FROM extension_requests/);
  });

  it("cannot be pending and decided at once", () => {
    expect(migration).toMatch(/\(status = 'pending'\) = \(decided_at IS NULL\)/);
  });

  it("allows only one open request per student per assignment", () => {
    // Enforced in the schema, so a double-tapped button cannot produce two.
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,160}WHERE status = 'pending'/);
  });

  it("does not move the deadline when granted", () => {
    // Scholar does not know what was agreed. A date it invented would be worse
    // than no date at all.
    expect(domain).not.toMatch(/due_at/);
    expect(queue).toMatch(/does not move the deadline/);
  });
});

describe("who may do what", () => {
  it("gates asking on being able to submit", () => {
    expect(route).toMatch(/permission: "submission:create"/);
  });

  it("gates answering on being able to grade", () => {
    expect(route).toMatch(/permission: "assignment:grade"/);
  });

  it("resolves scope from the assignment rather than from the caller", () => {
    // The request id is supplied by the client. The permission check must not
    // depend on it, or a teacher could answer another class's request.
    expect(route).toMatch(/scope: assignmentScope/);
    expect(route).toMatch(/scopeOfAssignment\(params\.assignmentId\)/);
  });

  it("refuses staff asking themselves for an extension", () => {
    expect(route).toMatch(/can\(actor, "assignment:grade", scope\)/);
  });

  it("refuses a request on work never set for this student", () => {
    // Differentiated assignment: an extension on something they were not given.
    expect(route).toMatch(/isSetFor\(params\.assignmentId, userId\)/);
  });
});
