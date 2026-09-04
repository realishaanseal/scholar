import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const cohorts = code("src/domains/identity/cohorts.ts");
const migration = code("src/lib/migrations/0021_cohorts.ts");

describe("a cohort adds people and never takes their work away", () => {
  it("does not unenrol when somebody leaves the group", () => {
    // A student who leaves a tutor group in March has still done the work in
    // those courses, and their submissions and marks belong to them.
    const fn = cohorts.slice(
      cohorts.indexOf("export async function removeFromCohort"),
      cohorts.indexOf("export async function linkCohortToSection")
    );
    expect(fn).toMatch(/DELETE FROM cohort_members/);
    expect(fn).not.toMatch(/enrollments/);
  });

  it("syncs additively, so re-running changes nothing", () => {
    expect(cohorts).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it("enrols in one statement rather than a loop", () => {
    // A year group of two hundred across eleven courses is 2,200 rows.
    const fn = cohorts.slice(cohorts.indexOf("export async function syncCohort"));
    expect(fn).toMatch(/INSERT INTO enrollments[\s\S]*?SELECT/);
    expect(fn).not.toMatch(/for \(/);
  });

  it("keeps the link so a later arrival is caught", () => {
    // The difference between "enrol these thirty now" and "this class is
    // Year 9" is that the second survives a transfer in March.
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS cohort_sections/);
    const add = cohorts.slice(
      cohorts.indexOf("export async function addToCohort"),
      cohorts.indexOf("export async function removeFromCohort")
    );
    expect(add).toMatch(/syncCohort/);
  });

  it("allows one cohort of a given name per school", () => {
    // A second "Year 9" is a typo, not a second year group.
    expect(migration).toMatch(/UNIQUE \(organization_id, name\)/);
  });
});
