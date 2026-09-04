import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  Things Scholar tells a student that nothing else can. The line running
  through all of them: a student's own records, told back to the student.
  Never a prediction, and never to anybody else.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const student = code("src/domains/insight/student.ts");
const library = code("src/domains/library/index.ts");

describe("where your marks go", () => {
  it("will not name a weakness on thin evidence", () => {
    // Telling somebody they are weak at structure on one essay is a bad
    // afternoon repeated back with false authority.
    expect(student).toMatch(/MIN_OCCASIONS = 3/);
    expect(student).toMatch(/occasions >= MIN_OCCASIONS/);
  });

  it("will not name one that is barely adrift", () => {
    // Criteria within a few points of each other have no weakest worth
    // telling anyone about.
    expect(student).toMatch(/averageElsewhere - weakest\.percentage >= 10/);
  });

  it("counts only marks the teacher has released", () => {
    // A student must not learn their result from a pattern before their
    // teacher has returned the work.
    expect(student).toMatch(/s\.posted_at IS NOT NULL/);
  });

  it("matches criteria across courses by name", () => {
    // "Structure" in English and "Structure" in History are different rows
    // and the same skill, and a student does not experience them separately.
    expect(student).toMatch(/lower\(trim\(rc\.title\)\)/);
  });

  it("is scoped to one student", () => {
    // Every query names the student. There is no cohort-shaped version of
    // this question available here.
    expect(student).toMatch(/WHERE s\.user_id = \?/);
    // No GROUP BY that groups *by* a person — that would be the cohort-shaped
    // version of this question, which is the one nobody gets to ask. Matched
    // on the clause itself rather than across the file, since a wider pattern
    // catches a GROUP BY in one query and a user_id in another.
    for (const clause of student.split("\n").filter((l) => /GROUP BY/.test(l))) {
      expect(clause, `grouped by a person: ${clause}`).not.toMatch(/user_id/);
    }
  });
});

describe("what you missed", () => {
  it("is a lookup, not an inference", () => {
    expect(student).toMatch(/whatYouMissed/);
    expect(student).not.toMatch(/\brisk\b|\bpredict|\blikely\b/i);
  });

  it("ignores lateness", () => {
    // Arriving late is not missing a day, and a catch-up list for a lesson
    // somebody attended is noise.
    expect(student).toMatch(/state IN \('absent', 'excused'\)/);
  });

  it("skips days with nothing to catch up on", () => {
    expect(student).toMatch(/length === 0.*continue|continue;/s);
  });
});

describe("the library", () => {
  it("orders by what is actually due", () => {
    // The join no other library has available: Scholar knows which of a
    // student's work is imminent, so the reading for Friday's essay belongs
    // at the top on Wednesday.
    expect(library).toMatch(/ORDER BY next_due NULLS LAST/);
  });

  it("shows only published material", () => {
    // A draft is a teacher still preparing.
    const fn = library.slice(library.indexOf("export async function materialsForStudent"));
    expect(fn).toMatch(/m\.is_published/);
  });

  it("respects differentiated work when judging urgency", () => {
    // Work set for somebody else must not make a shelf look urgent.
    const fn = library.slice(library.indexOf("export async function materialsForStudent"));
    expect(fn).toMatch(/assignment_assignees/);
  });

  it("covers every course at once", () => {
    // The whole point: finding the physics ebook should not begin with
    // remembering which course it was filed under.
    const fn = library.slice(library.indexOf("export async function materialsForStudent"));
    expect(fn).toMatch(/FROM enrollments e/);
  });
});
