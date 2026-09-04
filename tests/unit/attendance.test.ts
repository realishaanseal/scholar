import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
  A register is a legal document in most of the markets this is aimed at, and
  it is also the most tempting dataset in the product to misuse. These pin
  both halves.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const attendance = code("src/domains/attendance/index.ts");
const migration = code("src/lib/migrations/0020_attendance.ts");
const route = code("src/app/api/institution/sections/[sectionId]/attendance/route.ts");

describe("the register is a record, not a guess", () => {
  it("distinguishes an unopened register from a full house", () => {
    // Otherwise "nobody has taken it" and "everybody was present" are the
    // same row, and they are extremely different facts about a Tuesday.
    expect(migration).toMatch(/taken_at\s+timestamptz/);
    expect(attendance).toMatch(/takenAt/);
  });

  it("treats an authorised absence as its own state", () => {
    // Collapsing excused into absent is how a register becomes unfair to the
    // child with hospital appointments.
    expect(migration).toMatch(/'present', 'absent', 'late', 'excused'/);
  });

  it("does not count excused against a student's rate", () => {
    const fn = attendance.slice(attendance.indexOf("export async function attendanceFor"));
    expect(fn).toMatch(/present \+ late \+ excused/);
  });

  it("records a correction with both values", () => {
    // "Who changed this from absent to present, and when" has to be
    // answerable later by somebody who was not there.
    expect(attendance).toMatch(/from: was, to: m\.state/);
    expect(attendance).toMatch(/attendance:correction/);
  });

  it("does not call the first entry a correction", () => {
    // The first time a register is taken, nothing is an amendment.
    expect(attendance).toMatch(/if \(was && was !== m\.state\)/);
  });

  it("keeps a register on a calendar day rather than an instant", () => {
    // Which school day it belongs to must not shift because a teacher took it
    // from an airport.
    expect(migration).toMatch(/on_date\s+date NOT NULL/);
  });
});

describe("a register is not a student-facing list", () => {
  it("is guarded by a teaching permission", () => {
    // A list of which named children were in a room is not something a
    // student may read about their class.
    expect(route).toMatch(/permission: "assignment:create"/);
    expect(route).not.toMatch(/permission: "course:view"/);
  });
});

describe("attendance never becomes a prediction about a child", () => {
  it("is not read by anything that plans, ranks or reports upward", () => {
    // The rule was originally written as "no file in the insight layer may
    // mention attendance", which was a proxy rather than the rule. A student
    // reading their own register to find out what they missed is the data
    // being used for the person it is about, which was never the concern.
    //
    // The concern is that it becomes a prediction, or reaches an
    // administrator. So the planner, the institution-health module and the
    // risk detector stay clear of it entirely, and only the student-facing
    // module may read it at all.
    for (const f of ["plan.ts", "index.ts", "institution.ts"]) {
      expect(
        code(join("src/domains/insight", f)),
        `${f} must not read attendance`
      ).not.toMatch(/attendance/i);
    }
  });

  it("is read only to tell a student what they missed", () => {
    // The one permitted use, and it is a lookup rather than an inference:
    // these are the days you were away, and this is what was set on them.
    const student = code("src/domains/insight/student.ts");
    expect(student).toMatch(/whatYouMissed/);
    // No verdict about the person — nothing scored, ranked or forecast.
    expect(student).not.toMatch(/\brisk\b|\bpredict|\blikely\b/i);
  });

  it("never reaches an administrator's screens", () => {
    // Phase 10 refused engagement metrics for administrators. An attendance
    // chart by year group would be the same tool with a different label.
    const dir = join(process.cwd(), "src/app/(app)/admin");
    const pages: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) pages.push(readFileSync(p, "utf8"));
      }
    })(dir);
    expect(pages.join("\n")).not.toMatch(/attendance/i);
  });

  it("is not read by the risk detector", () => {
    expect(code("src/lib/scholar/detect.ts")).not.toMatch(/attendance/i);
  });

  it("computes nothing but counts", () => {
    // No score, no risk, no flag. Four totals and a rate.
    expect(attendance).not.toMatch(/\brisk\b|\bscore\b|\bpredict/i);
  });
});
