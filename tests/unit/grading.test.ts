import { describe, it, expect } from "vitest";
import { courseGrade, describeGrade, type Category, type GradedItem } from "@/domains/grading/compute";

/*
  This is the arithmetic a student will one day ask a teacher to justify, so it
  is tested the way something contestable should be: on the cases where an
  obvious implementation gives an answer that is defensibly wrong.
*/

const item = (over: Partial<GradedItem> = {}): GradedItem => ({
  assignmentId: "a" + Math.random().toString(36).slice(2, 7),
  categoryId: null,
  points: 10,
  score: null,
  missing: false,
  ...over,
});

describe("unmarked work is not a zero", () => {
  it("ignores work nobody has marked yet", () => {
    // The case that matters. A student who has done everything and been marked
    // on half would otherwise see 50% for as long as marking takes.
    const g = courseGrade(
      [item({ score: 9 }), item({ score: 8 }), item(), item()],
      []
    );
    expect(g.percentage).toBe(85);
    expect(g.counted).toBe(2);
    expect(g.awaiting).toBe(2);
  });

  it("does count work that was never handed in", () => {
    // Missing is a different thing from unmarked, and it genuinely is a zero.
    const g = courseGrade([item({ score: 10 }), item({ missing: true })], []);
    expect(g.percentage).toBe(50);
    expect(g.missing).toBe(1);
  });

  it("reports nothing rather than zero when nothing is marked", () => {
    const g = courseGrade([item(), item()], []);
    expect(g.percentage).toBeNull();
    expect(describeGrade(g)).toBe("Nothing marked yet");
  });

  it("ignores work carrying no marks", () => {
    // Formative work with no points should not dilute anything.
    const g = courseGrade([item({ score: 10 }), item({ points: null, score: null })], []);
    expect(g.percentage).toBe(100);
    expect(g.counted).toBe(1);
  });

  it("handles a zero-point assignment without dividing by zero", () => {
    const g = courseGrade([item({ points: 0, score: 0 })], []);
    expect(g.percentage).toBeNull();
  });
});

describe("straight points, with no categories", () => {
  it("totals earned over possible", () => {
    const g = courseGrade(
      [item({ points: 20, score: 15 }), item({ points: 30, score: 27 })],
      []
    );
    expect(g.earned).toBe(42);
    expect(g.possible).toBe(50);
    expect(g.percentage).toBe(84);
  });

  it("weights a bigger assignment more, because it is out of more", () => {
    // 100% on a 10-mark task and 50% on a 90-mark one is not 75%.
    const g = courseGrade(
      [item({ points: 10, score: 10 }), item({ points: 90, score: 45 })],
      []
    );
    expect(g.percentage).toBe(55);
  });

  it("rounds without a floating point tail", () => {
    // A grade shown as 86.66999999999999 is a grade nobody trusts.
    const g = courseGrade([item({ points: 3, score: 2.6 })], []);
    expect(String(g.percentage)).not.toMatch(/\d{6,}/);
    expect(g.percentage).toBe(86.67);
  });
});

describe("weighted categories", () => {
  const cats: Category[] = [
    { id: "hw", name: "Homework", weight: 40 },
    { id: "ex", name: "Exams", weight: 60 },
  ];

  it("weights each category by its share, not by its points", () => {
    // Perfect homework, half marks on the exam. Points would say 55%;
    // the syllabus says exams are 60% of the grade, so it is 70%.
    const g = courseGrade(
      [
        item({ categoryId: "hw", points: 10, score: 10 }),
        item({ categoryId: "ex", points: 100, score: 50 }),
      ],
      cats
    );
    expect(g.percentage).toBe(70);
  });

  it("renormalises over categories that have been assessed", () => {
    // The exam has not happened. A student with full marks on homework is at
    // 100%, not 40% — otherwise every student appears to be failing until
    // finals week.
    const g = courseGrade([item({ categoryId: "hw", points: 10, score: 10 })], cats);
    expect(g.percentage).toBe(100);
  });

  it("averages within a category before weighting it", () => {
    const g = courseGrade(
      [
        item({ categoryId: "hw", points: 10, score: 5 }),
        item({ categoryId: "hw", points: 10, score: 10 }),
        item({ categoryId: "ex", points: 10, score: 10 }),
      ],
      cats
    );
    // Homework 15/20 = 75, exams 100. 75*0.4 + 100*0.6 = 90.
    expect(g.percentage).toBe(90);
  });

  it("gives uncategorised work the unclaimed weight", () => {
    const partial: Category[] = [{ id: "ex", name: "Exams", weight: 70 }];
    const g = courseGrade(
      [
        item({ categoryId: "ex", points: 10, score: 10 }),
        item({ categoryId: null, points: 10, score: 0 }),
      ],
      partial
    );
    // Exams 100 at 70%, other work 0 at the remaining 30%.
    expect(g.percentage).toBe(70);
  });

  it("flags weights that do not total 100 without refusing to compute", () => {
    // A teacher half way through configuring a course should still see marks.
    const g = courseGrade(
      [item({ categoryId: "hw", points: 10, score: 8 })],
      [{ id: "hw", name: "Homework", weight: 30 }]
    );
    expect(g.weightsIncomplete).toBe(true);
    expect(g.percentage).toBe(80);
  });

  it("reports per-category detail a student can check", () => {
    const g = courseGrade(
      [
        item({ categoryId: "hw", points: 10, score: 7 }),
        item({ categoryId: "ex", points: 10, score: 9 }),
      ],
      cats
    );
    const hw = g.categories.find((c) => c.categoryId === "hw")!;
    expect(hw).toMatchObject({ name: "Homework", weight: 40, earned: 7, possible: 10, percentage: 70 });
  });

  it("does not count an empty category", () => {
    const g = courseGrade([item({ categoryId: "hw", points: 10, score: 10 })], cats);
    const ex = g.categories.find((c) => c.categoryId === "ex")!;
    expect(ex.percentage).toBeNull();
    expect(ex.counted).toBe(0);
  });
});

describe("edge cases", () => {
  it("survives an empty course", () => {
    const g = courseGrade([], []);
    expect(g.percentage).toBeNull();
    expect(describeGrade(g)).toBe("No marked work");
  });

  it("allows more than full marks, since teachers award extra credit", () => {
    const g = courseGrade([item({ points: 10, score: 12 })], []);
    expect(g.percentage).toBe(120);
  });

  it("counts a zero mark, which is not the same as no mark", () => {
    const g = courseGrade([item({ points: 10, score: 0 }), item({ points: 10, score: 10 })], []);
    expect(g.percentage).toBe(50);
    expect(g.counted).toBe(2);
  });
});

/* ── The audit trail as a structural property ──────────────────────────── */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("a grade cannot change without someone being accountable", () => {
  const grading = readFileSync(join(process.cwd(), "src/domains/grading/index.ts"), "utf8");
  const assessment = readFileSync(
    join(process.cwd(), "src/domains/assessment/repository.ts"),
    "utf8"
  );

  it("requires an actor to record a grade event", () => {
    // Scoped to the write signature. The read type deliberately allows null,
    // because a departed teacher's account can be removed without erasing the
    // record that they marked something — but nothing may be *written* without
    // a person attached.
    const signature = grading.slice(
      grading.indexOf("export async function recordGradeEvent"),
      grading.indexOf("): Promise<void> {", grading.indexOf("export async function recordGradeEvent"))
    );
    expect(signature).toMatch(/actorUserId:\s*string;/);
    expect(signature).not.toMatch(/actorUserId\?:/);
    expect(signature).not.toMatch(/actorUserId:\s*string\s*\|\s*null/);
  });

  it("records an event on every path that writes a mark", () => {
    // The trail is worthless if it is conditional. gradeSubmission is the only
    // function that writes a score, and it always records.
    const fn = assessment.slice(
      assessment.indexOf("export async function gradeSubmission"),
      assessment.indexOf("function mapSubmission")
    );
    expect(fn).toContain("recordGradeEvent");
    // Not inside a conditional that could skip it.
    expect(fn).not.toMatch(/if\s*\([^)]*\)\s*\{?\s*await recordGradeEvent/);
  });

  it("keeps the score before as well as after", () => {
    // "Changed to 62" is half a story.
    expect(grading).toMatch(/previousScore/);
    expect(grading).toMatch(/newScore/);
  });

  it("never updates or deletes an event", () => {
    // Append-only by intent: the history of a contested grade must not be
    // tidiable by the person being contested.
    expect(grading).not.toMatch(/UPDATE grade_events/i);
    expect(grading).not.toMatch(/DELETE FROM grade_events/i);
  });

  it("records whether a model drafted the mark, separately from who approved it", () => {
    expect(grading).toMatch(/aiModel/);
    expect(assessment).toMatch(/aiModel/);
  });
});
