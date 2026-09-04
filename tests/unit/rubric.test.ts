import { describe, it, expect } from "vitest";
import {
  describeProgress, rubricScoreFor, scoreCriterion, scoreRubric,
  type Criterion,
} from "@/domains/assessment/rubric";

/*
  What a student is told they scored on "use of evidence", and why. Tested on
  the cases where an obvious implementation gives an answer a teacher would
  have to apologise for.
*/

const evidence: Criterion = {
  id: "c-ev",
  title: "Use of evidence",
  points: 4,
  levels: [
    { id: "l4", label: "Excellent", points: 4 },
    { id: "l3", label: "Good", points: 3 },
    { id: "l2", label: "Developing", points: 2 },
    { id: "l0", label: "Not yet", points: 0 },
  ],
};

const structure: Criterion = {
  id: "c-st",
  title: "Structure",
  points: 6,
  levels: [
    { id: "s6", label: "Excellent", points: 6 },
    { id: "s3", label: "Adequate", points: 3 },
  ],
};

describe("an unmarked criterion is not a zero", () => {
  it("returns null rather than 0 when nobody has decided", () => {
    // Same rule as the gradebook: a rubric half filled in should read as half
    // filled in, not as a bad mark.
    const r = scoreCriterion(evidence, undefined);
    expect(r.awarded).toBeNull();
    expect(r.possible).toBe(4);
  });

  it("withholds a percentage until the rubric is finished", () => {
    const r = scoreRubric([evidence, structure], [{ criterionId: "c-ev", levelId: "l4" }]);
    expect(r.complete).toBe(false);
    expect(r.percentage).toBeNull();
    expect(r.outstanding).toBe(1);
    // The points that are settled are still reported — a marker mid-way
    // through wants to see their own work.
    expect(r.awarded).toBe(4);
  });

  it("gives a percentage once every criterion is decided", () => {
    const r = scoreRubric(
      [evidence, structure],
      [{ criterionId: "c-ev", levelId: "l3" }, { criterionId: "c-st", levelId: "s6" }]
    );
    expect(r.complete).toBe(true);
    expect(r.awarded).toBe(9);
    expect(r.possible).toBe(10);
    expect(r.percentage).toBe(90);
  });

  it("counts a deliberate zero as decided", () => {
    // "Not yet" is a judgement, and it is not the same as an empty row.
    const r = scoreRubric([evidence], [{ criterionId: "c-ev", levelId: "l0" }]);
    expect(r.complete).toBe(true);
    expect(r.awarded).toBe(0);
    expect(r.percentage).toBe(0);
  });
});

describe("levels are worth what they say", () => {
  it("never infers points from a level's position", () => {
    // A rubric running 4/3/2/0 is a real thing teachers build. Treating the
    // fourth level as "1 because it is fourth" would silently rewrite it.
    expect(scoreCriterion(evidence, { criterionId: "c-ev", levelId: "l0" }).awarded).toBe(0);
    expect(scoreCriterion(evidence, { criterionId: "c-ev", levelId: "l2" }).awarded).toBe(2);
  });

  it("carries the level's label through for display", () => {
    const r = scoreCriterion(evidence, { criterionId: "c-ev", levelId: "l3" });
    expect(r.levelLabel).toBe("Good");
    expect(r.levelId).toBe("l3");
  });

  it("prefers a chosen level over a typed score", () => {
    // Picking a level is the more specific act.
    const r = scoreCriterion(evidence, { criterionId: "c-ev", levelId: "l2", points: 4 });
    expect(r.awarded).toBe(2);
  });

  it("accepts a typed score when no level was chosen", () => {
    // Criteria without levels are free-scored, and some markers prefer it.
    const r = scoreCriterion(evidence, { criterionId: "c-ev", points: 3.5 });
    expect(r.awarded).toBe(3.5);
    expect(r.levelId).toBeNull();
  });

  it("treats a level that is no longer on the criterion as unmarked", () => {
    // A rubric edited after marking began. The marker did choose something,
    // so the safe reading is that nobody has re-decided — not that they
    // scored zero.
    const r = scoreCriterion(evidence, { criterionId: "c-ev", levelId: "deleted" });
    expect(r.awarded).toBeNull();
  });

  it("refuses a negative typed score", () => {
    expect(scoreCriterion(evidence, { criterionId: "c-ev", points: -5 }).awarded).toBe(0);
  });
});

describe("turning a rubric into the assignment's mark", () => {
  const finished = scoreRubric(
    [evidence, structure],
    [{ criterionId: "c-ev", levelId: "l3" }, { criterionId: "c-st", levelId: "s6" }]
  );

  it("rescales onto the assignment's own marks", () => {
    // A rubric worth 10 on an assignment out of 20 must not cap everyone at
    // 10. 9/10 becomes 18/20.
    expect(rubricScoreFor(finished, 20, true)).toBe(18);
  });

  it("uses the rubric's own total when the assignment has no marks", () => {
    expect(rubricScoreFor(finished, null, true)).toBe(9);
  });

  it("stays out of the way when the rubric is not what decides the score", () => {
    // Sometimes a rubric explains a mark the teacher gave for other reasons.
    expect(rubricScoreFor(finished, 20, false)).toBeNull();
  });

  it("proposes nothing from an unfinished rubric", () => {
    const partial = scoreRubric([evidence, structure], [{ criterionId: "c-ev", levelId: "l4" }]);
    expect(rubricScoreFor(partial, 20, true)).toBeNull();
  });

  it("survives a rubric worth nothing", () => {
    const empty = scoreRubric(
      [{ id: "z", title: "Zero", points: 0, levels: [] }],
      [{ criterionId: "z", points: 0 }]
    );
    expect(rubricScoreFor(empty, 20, true)).toBeNull();
  });
});

describe("telling a marker where they are", () => {
  it("says nothing has been started", () => {
    expect(describeProgress(scoreRubric([evidence, structure], []))).toBe("Not started");
  });

  it("counts what is left", () => {
    const r = scoreRubric([evidence, structure], [{ criterionId: "c-ev", levelId: "l4" }]);
    expect(describeProgress(r)).toMatch(/1 criterion left/);
  });

  it("gives the total once finished", () => {
    const r = scoreRubric(
      [evidence, structure],
      [{ criterionId: "c-ev", levelId: "l4" }, { criterionId: "c-st", levelId: "s3" }]
    );
    expect(describeProgress(r)).toBe("7 of 10");
  });

  it("says so when a rubric has no criteria", () => {
    expect(describeProgress(scoreRubric([], []))).toMatch(/no criteria/);
  });
});

/* ── Structural: a rubric is not a second way to write a grade ──────────── */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("marking a rubric never writes a grade", () => {
  const code = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const route = code("src/app/api/institution/submissions/[submissionId]/rubric/route.ts");
  const repo = code("src/domains/assessment/rubrics.ts");

  it("does not touch the submission's score", () => {
    // Recording a grade stays the grade route's job, with its required human
    // actor and its audit entry. A rubric must not become a quieter way to
    // mark somebody.
    expect(route).not.toContain("gradeSubmission");
    expect(route).not.toMatch(/UPDATE assignment_submissions/i);
    expect(repo).not.toContain("gradeSubmission");
    expect(repo).not.toMatch(/UPDATE assignment_submissions/i);
  });

  it("returns a suggestion rather than applying one", () => {
    expect(route).toMatch(/suggestedScore/);
  });

  it("withholds a student's result until the work is returned", () => {
    // A half-filled rubric is a marker's working-out, and reading someone's
    // provisional judgement of you is worse than waiting.
    expect(route).toMatch(/status !== "returned"/);
    expect(route).toMatch(/pending: true/);
  });

  it("saves one criterion at a time", () => {
    // So a closed tab does not lose an afternoon, and two moderators do not
    // overwrite each other wholesale.
    expect(repo).toMatch(/ON CONFLICT \(submission_id, criterion_id\)/);
  });
});
