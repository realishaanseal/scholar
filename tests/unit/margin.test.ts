import { describe, it, expect } from "vitest";
import {
  finishingMargins, MIN_GAP, MIN_PER_BAND, type FinishedPiece,
} from "@/domains/insight/margin";

/*
  A student told that leaving things late costs them will reasonably want to
  check it. These pin the guards that stop the claim being made on nothing.
*/

const HOUR = 3_600_000;
const due = new Date(2026, 8, 18, 23, 59);

const piece = (hoursSpare: number, estimateMins: number, actualMins: number): FinishedPiece => ({
  dueAt: due,
  completedAt: new Date(due.getTime() - hoursSpare * HOUR),
  estimateMins,
  actualMins,
});

const many = (n: number, hoursSpare: number, est: number, act: number) =>
  Array.from({ length: n }, () => piece(hoursSpare, est, act));

describe("finishing margins", () => {
  it("separates work finished with room from work finished on the day", () => {
    const m = finishingMargins([
      ...many(4, 48, 60, 60),
      ...many(4, 3, 60, 96),
    ]);
    expect(m.bands).toHaveLength(2);
    expect(m.bands[0].label).toMatch(/day or more/);
    expect(m.bands[0].ratio).toBe(1);
    expect(m.bands[1].ratio).toBe(1.6);
  });

  it("will not describe a band on fewer than three pieces", () => {
    // Two late nights is a fortnight, not a habit.
    const m = finishingMargins([
      ...many(4, 48, 60, 60),
      ...many(MIN_PER_BAND - 1, 2, 60, 120),
    ]);
    expect(m.bands).toHaveLength(1);
    expect(m.gap).toBeNull();
  });

  it("stays quiet when the bands say the same thing", () => {
    const m = finishingMargins([
      ...many(4, 48, 60, 63),
      ...many(4, 2, 60, 66),
    ]);
    expect(m.bands).toHaveLength(2);
    expect(m.gap).toBeNull();
  });

  it("reports the gap once it is worth reporting", () => {
    const m = finishingMargins([
      ...many(3, 48, 60, 60),
      ...many(3, 1, 60, 90),
    ]);
    expect(m.gap).not.toBeNull();
    expect(Math.abs(m.gap!)).toBeGreaterThanOrEqual(MIN_GAP);
  });

  it("counts work finished after the deadline as its own band", () => {
    const m = finishingMargins(many(3, -5, 60, 120));
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0].label).toMatch(/after the deadline/);
    expect(m.bands[0].late).toBe(3);
  });

  it("ignores work that was never estimated or never timed", () => {
    const m = finishingMargins([
      ...many(3, 48, 0, 60),
      ...many(3, 48, 60, 0),
    ]);
    expect(m.bands).toHaveLength(0);
  });

  it("survives having nothing finished", () => {
    expect(finishingMargins([])).toEqual({ bands: [], gap: null });
  });

  it("says nothing about a grade", () => {
    // The obvious version of this feature relates finishing early to the mark.
    // The data cannot support that claim: somebody who finishes early on the
    // work they find easy produces exactly the same correlation.
    const src = new URL("../../src/domains/insight/margin.ts", import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const text = require("node:fs").readFileSync(src, "utf8") as string;
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const t of [/\bgrade\b/i, /\bmark\b/i, /\bscore\b/i, /\bpredict/i]) {
      expect(code, `margins must not mention ${t}`).not.toMatch(t);
    }
  });
});
