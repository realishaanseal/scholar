import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  A teacher looking at how their class did is a different question from a
  teacher looking at how a student spends their evenings. Only the first is
  answerable, and these pin the difference.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const domain = code("src/domains/insight/teaching.ts");
const panel = code("src/components/teach/HowItWent.tsx");

/** Word-boundary match built without a template literal, where \b would be a
 *  backspace escape rather than a boundary. */
const boundary = (t: string) => new RegExp(String.raw`\b` + t + String.raw`\b`);

const PERSONAL = [
  "homework", "task_events", "academic_profile", "timetable",
  "focusSeconds", "estimateMins", "dismissed_signals", "study_sessions",
];

describe("a teacher reads their own marking, not a student's life", () => {
  it("names no personal table", () => {
    for (const t of PERSONAL) {
      expect(domain, `teaching insight must not read ${t}`).not.toMatch(boundary(t));
      expect(panel, `the panel must not read ${t}`).not.toMatch(boundary(t));
    }
  });

  it("takes no parameter that could widen into one", () => {
    // Every exported read is scoped by assignment or section plus organization.
    // A userId argument is the shape that would let a caller ask about a person.
    expect(domain).not.toMatch(/userId\s*:/);
    expect(domain).not.toMatch(/studentId\s*:/);
  });

  it("reads only released rubric marks and their timestamps", () => {
    expect(domain).toMatch(/FROM rubric_marks/);
    expect(domain).not.toMatch(/domains\/insight\/(plan|week|student)/);
  });
});

describe("what the class found hard", () => {
  it("will not report a criterion on thin evidence", () => {
    expect(domain).toMatch(/MIN_MARKED = 5/);
    expect(panel).toMatch(/marked >= MIN_MARKED/);
  });

  it("orders criteria weakest first", () => {
    // The opposite choice to the attendance register, for the opposite reason:
    // this ranks the parts of an assessment, not the children who sat it.
    expect(domain).toMatch(/sort\(\(a, b\) => a\.share - b\.share\)/);
  });
});

describe("marking drift", () => {
  it("stays quiet on a single sitting or a small difference", () => {
    expect(domain).toMatch(/MIN_SITTINGS = 2/);
    expect(domain).toMatch(/MIN_SPREAD = 0\.08/);
    expect(domain).toMatch(/days\.length < MIN_SITTINGS/);
  });

  it("reports a comparison and never adjusts a mark", () => {
    // Scholar cannot tell whether the difference is the marker or the scripts.
    // A product that guessed would be changing grades on a suspicion.
    for (const forbidden of [/adjust/i, /correct(ed|ion)/i, /rescal/i, /moderat(e|ed|ion)/i]) {
      expect(domain, `drift must not ${forbidden}`).not.toMatch(forbidden);
    }
    expect(panel).toMatch(/nothing has been adjusted/i);
  });

  it("is shown to the teacher and to nobody else", () => {
    // An administrator holding marking drift by staff member has a
    // performance-management tool, which is not what this is.
    const adminDir = "src/app/(app)/admin";
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const found: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) found.push(readFileSync(p, "utf8"));
      }
    })(join(process.cwd(), adminDir));
    expect(found.join("\n")).not.toMatch(/markingDrift|HowItWent|insight\/teaching/);
  });
});
