import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  An administrator seeing when work falls due is coordination. An administrator
  seeing which children are struggling under it is the dashboard Phase 10
  refused. The difference is whether a student appears at all.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const domain = code("src/domains/insight/load.ts");
const page = code("src/app/(app)/admin/calendar/page.tsx");

const boundary = (t: string) => new RegExp(String.raw`\b` + t + String.raw`\b`);

describe("the subject is the work, not the people doing it", () => {
  it("joins no table that holds a person", () => {
    for (const t of ["users", "enrollments", "assignment_submissions",
                     "attendance_marks", "homework", "task_events",
                     "academic_profile"]) {
      expect(domain, `assessment load must not read ${t}`).not.toMatch(boundary(t));
    }
  });

  it("returns no count of students and no student id", () => {
    // A "23 students affected" figure is the step from a timetable to a
    // caseload, and it is one query away, so this is worth pinning.
    expect(domain).not.toMatch(/student/i);
    expect(domain).not.toMatch(/user_id|userId/);
    expect(page).not.toMatch(/student/i);
  });

  it("reads only published work with a real deadline", () => {
    // Drafts are a teacher thinking aloud and must not appear on an
    // institutional calendar.
    expect(domain).toMatch(/a\.status = 'published'/);
    expect(domain).toMatch(/a\.due_at IS NOT NULL/);
  });
});

describe("what counts as a heavy day", () => {
  it("measures a quantity of work rather than a count of pieces", () => {
    // Three short exercises and one long essay are not the same Friday.
    expect(domain).toMatch(/BUSY_MINS = 240/);
    expect(domain).toMatch(/estimatedMins >= BUSY_MINS/);
  });

  it("only flags a day where more than one course lands", () => {
    // One teacher setting four hours is that teacher's business, and they can
    // already see it. The collision is the thing nobody can see.
    expect(domain).toMatch(/d\.courses\.length > 1/);
  });

  it("says how much of the total is unestimated rather than guessing", () => {
    expect(domain).toMatch(/unestimated/);
    expect(page).toMatch(/without an estimate/);
  });
});
