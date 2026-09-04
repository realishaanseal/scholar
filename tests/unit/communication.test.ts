import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  A withheld mark is a promise to a teacher that a student will not see
  something yet. These pin the places that promise could quietly break.
*/

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const learning = code("src/domains/learning/index.ts");
const grading = code("src/domains/grading/index.ts");
const communication = code("src/domains/communication/index.ts");
const migration = code("src/lib/migrations/0018_announcements.ts");

describe("a held-back mark is held back everywhere", () => {
  it("nulls the score in the query rather than filtering later", () => {
    // Filtered after the fact is one forgotten code path away from a leak.
    expect(learning).toMatch(/CASE WHEN s\.posted_at IS NOT NULL THEN s\.score END/);
  });

  it("withholds the feedback with the mark", () => {
    // Written feedback frequently contains the grade in words.
    expect(learning).toMatch(/CASE WHEN s\.posted_at IS NOT NULL THEN s\.feedback/);
  });

  it("keeps it out of the student's course total", () => {
    // Otherwise a student works the withheld mark out from their own
    // percentage, which is the same disclosure by a slower route.
    const fn = grading.slice(grading.indexOf("export async function studentGrade"));
    expect(fn).toMatch(/posted_at IS NOT NULL/);
  });
});

describe("releasing marks", () => {
  it("only posts marks that were actually written", () => {
    // Posting an ungraded submission releases nothing and sets a timestamp
    // that later reads as a lie.
    const fn = communication.slice(
      communication.indexOf("export async function postGrades"),
      communication.indexOf("export async function unpostGrades")
    );
    expect(fn).toMatch(/graded_at IS NOT NULL/);
  });

  it("reports how many became visible", () => {
    // "Posted" with no number is indistinguishable from "posted nothing".
    expect(communication).toMatch(/RETURNING id/);
  });

  it("backfills so nothing already returned becomes invisible", () => {
    // A migration that hid marks students had already seen would be the
    // worst possible way to introduce this.
    expect(migration).toMatch(/UPDATE assignment_submissions[\s\S]*?SET posted_at = graded_at/);
  });

  it("defaults to releasing immediately", () => {
    // Most work is marked one piece at a time and there is nothing to hold.
    expect(migration).toMatch(/grade_posting text NOT NULL DEFAULT 'automatic'/);
  });
});

describe("announcements", () => {
  it("shows a student only what has been published", () => {
    const fn = communication.slice(
      communication.indexOf("export async function announcementsFor"),
      communication.indexOf("export async function sectionAnnouncements")
    );
    expect(fn).toMatch(/published_at IS NOT NULL/);
  });

  it("gives a student the school's notices in the same list", () => {
    // Making somebody check two places is how they check neither.
    const fn = communication.slice(
      communication.indexOf("export async function announcementsFor"),
      communication.indexOf("export async function sectionAnnouncements")
    );
    expect(fn).toMatch(/course_section_id IS NULL/);
  });

  it("keeps the author legible after they leave", () => {
    expect(migration).toMatch(/author_label/);
    expect(migration).toMatch(/created_by\s+text REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it("sends no email", () => {
    // Scholar has no mail infrastructure, and an announcement a teacher
    // believes was delivered and a student never received is worse than none.
    expect(communication).not.toMatch(/sendMail|nodemailer|smtp|resend/i);
  });
});
