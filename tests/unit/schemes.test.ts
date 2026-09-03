import { describe, it, expect } from "vitest";
import {
  compareGrades, displayGrade, gradeStrength, higherIsBetter, SCHEMES, scheme,
} from "@/domains/grading/schemes";

/*
  The same piece of work, written down the way seven different countries write
  it. The arithmetic underneath never changes; only the sentence does. The
  cases that matter are the ones where a plausible implementation is
  confidently wrong — above all Germany, where the scale runs backwards.
*/

describe("the German scale runs the other way", () => {
  const de = scheme("de-noten");

  it("calls 95% a 1, which is the best grade available", () => {
    const g = displayGrade(95, de)!;
    expect(g.text).toBe("1");
    expect(g.name).toBe("sehr gut");
    expect(g.points).toBe(1);
  });

  it("calls 20% a 6, which is the worst", () => {
    const g = displayGrade(20, de)!;
    expect(g.text).toBe("6");
    expect(g.name).toBe("ungenügend");
  });

  it("declares that a lower displayed number is better", () => {
    // The property every naive sort, colour scale and arrow icon gets wrong.
    expect(higherIsBetter(de)).toBe(false);
    expect(higherIsBetter(scheme("us-letter"))).toBe(true);
  });

  it("still sorts the better student first", () => {
    // 85% is a 2 and 60% is a 4. Sorting on the displayed number would put
    // the weaker student top; sorting on the percentage does not.
    const sorted = [60, 95, 85].sort(compareGrades);
    expect(sorted).toEqual([95, 85, 60]);
    expect(displayGrade(sorted[0], de)!.text).toBe("1");
  });

  it("passes at 4 and fails at 5", () => {
    expect(displayGrade(55, de)!.passing).toBe(true);
    expect(displayGrade(45, de)!.passing).toBe(false);
  });

  it("does not print a percentage a German report would not carry", () => {
    expect(displayGrade(85, de)!.text).not.toMatch(/%/);
  });
});

describe("the conventions Scholar ships with", () => {
  it("writes American letters with the boundaries Americans use", () => {
    const us = scheme("us-letter");
    expect(displayGrade(94, us)!.text).toMatch(/^A /);
    expect(displayGrade(85, us)!.text).toMatch(/^B /);
    expect(displayGrade(45, us)!.text).toMatch(/^F /);
    expect(displayGrade(94, us)!.points).toBe(4);
  });

  it("uses the British boundaries, which are not the American ones", () => {
    // 70 is a First in the UK and a C in the US. Applying either country's
    // cut-offs to the other is the single most common way this goes wrong.
    const uk = scheme("uk-classification");
    expect(displayGrade(72, uk)!.name).toBe("First-class");
    expect(displayGrade(65, uk)!.text).toMatch(/2:1/);
    expect(displayGrade(72, scheme("us-letter"))!.text).toMatch(/^C/);
  });

  it("writes French marks out of twenty, with a comma", () => {
    // A French report says 15,5 rather than 15.5.
    expect(displayGrade(77.5, scheme("fr-vingt"))!.text).toBe("15,5");
  });

  it("writes Dutch marks out of ten", () => {
    expect(displayGrade(75, scheme("nl-tien"))!.text).toBe("7,5");
    expect(displayGrade(55, scheme("nl-tien"))!.passing).toBe(true);
  });

  it("maps to an IB subject grade", () => {
    expect(displayGrade(92, scheme("ib-seven"))!.text).toBe("7");
    expect(displayGrade(60, scheme("ib-seven"))!.text).toBe("4");
  });

  it("keeps CGPA points for averaging", () => {
    const g = displayGrade(85, scheme("in-cgpa"))!;
    expect(g.points).toBe(9);
    expect(g.name).toBe("A2");
  });

  it("leaves a percentage alone when that is the convention", () => {
    expect(displayGrade(86.67, scheme("percent"))!.text).toBe("86.67%");
  });
});

describe("the percentage survives whatever the scheme does to it", () => {
  it("carries the original number through every scheme", () => {
    // A disputed grade must always be traceable to marks and weights rather
    // than to a band boundary.
    for (const s of SCHEMES) {
      expect(displayGrade(73.5, s)!.percent).toBe(73.5);
    }
  });

  it("says nothing rather than zero when there is no grade", () => {
    for (const s of SCHEMES) expect(displayGrade(null, s)).toBeNull();
  });

  it("handles marks above 100, which teachers do award", () => {
    expect(() => displayGrade(112, scheme("de-noten"))).not.toThrow();
    expect(displayGrade(112, scheme("us-letter"))!.text).toMatch(/A\+/);
  });

  it("falls back to a known scheme rather than crashing on an unknown id", () => {
    expect(scheme("not-a-scheme").id).toBe("percent");
    expect(scheme(null).id).toBe("percent");
  });
});

describe("ordering and strength are direction-safe", () => {
  it("puts unmarked work last rather than first", () => {
    // null sorting to the top would put every unmarked student above every
    // marked one on a "sort by grade" control.
    expect([null, 50, null, 90].sort(compareGrades)).toEqual([90, 50, null, null]);
  });

  it("orients strength so that 1 is always good", () => {
    // A colour scale can use this without knowing which convention it is
    // rendering, which is what stops the German scale painting the best work
    // in the failing colour.
    expect(gradeStrength(100)).toBe(1);
    expect(gradeStrength(0)).toBe(0);
    expect(gradeStrength(null)).toBeNull();
    expect(gradeStrength(150)).toBe(1);
  });
});
