import { describe, it, expect } from "vitest";
import {
  calibrateEstimate, deadlineCollisions, planStart, MIN_PACE_SAMPLE,
} from "@/domains/insight/plan";
import type { AvailabilityProfile, SubjectPace } from "@/lib/scholar/types";

/*
  This is the arithmetic behind "start this on Thursday" — advice a student
  will act on, and occasionally resent. It is tested on the cases where the
  obvious implementation gives an answer that is confidently wrong.
*/

const profile: AvailabilityProfile = {
  weekdayMins: 120,
  weekendMins: 240,
  studyStartHour: 16,
  studyEndHour: 22,
};

const pace = (over: Partial<SubjectPace> = {}): SubjectPace => ({
  subject: "Physics",
  calibration: 1,
  averageActualMins: 60,
  onTimeRate: 1,
  sampleSize: 10,
  ...over,
});

/** A Monday at 16:00, the start of the study window. */
const monday4pm = new Date(2026, 8, 7, 16, 0, 0);

describe("the teacher's estimate, corrected by what the student actually does", () => {
  it("stretches an estimate for a student who runs slow in this subject", () => {
    const out = calibrateEstimate(60, pace({ calibration: 1.5 }));
    expect(out.mins).toBe(90);
    expect(out.adjusted).toBe(true);
    expect(out.reason).toMatch(/50% longer/);
  });

  it("shortens it for a student who runs fast", () => {
    const out = calibrateEstimate(60, pace({ calibration: 0.5 }));
    expect(out.mins).toBe(30);
    expect(out.adjusted).toBe(true);
    expect(out.reason).toMatch(/faster/);
  });

  it("will not calibrate on too little evidence", () => {
    // One bad afternoon must not permanently inflate every future estimate.
    const out = calibrateEstimate(60, pace({ calibration: 2, sampleSize: MIN_PACE_SAMPLE - 1 }));
    expect(out.mins).toBe(60);
    expect(out.adjusted).toBe(false);
    expect(out.reason).toMatch(/not seen enough/i);
  });

  it("says whose number it is when there is no history at all", () => {
    const out = calibrateEstimate(45, undefined);
    expect(out.mins).toBe(45);
    expect(out.adjusted).toBe(false);
    expect(out.reason).toMatch(/teacher/i);
  });

  it("does not claim an adjustment that changed nothing", () => {
    const out = calibrateEstimate(60, pace({ calibration: 1.001 }));
    expect(out.mins).toBe(60);
    expect(out.adjusted).toBe(false);
  });

  it("has nothing to say when the teacher set no estimate", () => {
    expect(calibrateEstimate(null, pace()).mins).toBeNull();
    expect(calibrateEstimate(0, pace()).mins).toBeNull();
  });
});

describe("the latest day this can be begun", () => {
  it("says start now when the work only just fits", () => {
    // 120 minutes of capacity today, 110 minutes of work, due tonight.
    const due = new Date(2026, 8, 7, 22, 0, 0);
    const plan = planStart(due, 110, profile, monday4pm);
    expect(plan.kind).toBe("start-now");
  });

  it("leaves it later when there is a week of room", () => {
    const due = new Date(2026, 8, 14, 22, 0, 0);
    const plan = planStart(due, 60, profile, monday4pm);
    expect(plan.kind).toBe("start-by");
    if (plan.kind === "start-by") {
      // An hour of work with a week to do it in should not be demanded today.
      expect(plan.startBy.getTime()).toBeGreaterThan(monday4pm.getTime());
      expect(plan.slackMins).toBeGreaterThan(0);
    }
  });

  it("reports a shortfall rather than softening it", () => {
    // Nine hours of work, one evening left. Saying anything encouraging here
    // would cost the student the chance to ask for an extension.
    const due = new Date(2026, 8, 7, 22, 0, 0);
    const plan = planStart(due, 540, profile, monday4pm);
    expect(plan.kind).toBe("too-late");
    if (plan.kind === "too-late") expect(plan.shortfallMins).toBeGreaterThan(0);
  });

  it("counts a weekend as the larger day it is", () => {
    // Saturday affords 240 minutes where a weekday affords 120, so work that
    // would not fit in a weekday does fit in a Saturday.
    const satMorning = new Date(2026, 8, 12, 9, 0, 0);
    const satNight = new Date(2026, 8, 12, 22, 0, 0);
    expect(planStart(satNight, 200, profile, satMorning).kind).not.toBe("too-late");
  });

  it("never proposes a start in the past", () => {
    const due = new Date(2026, 8, 30, 22, 0, 0);
    const plan = planStart(due, 30, profile, monday4pm);
    if (plan.kind === "start-by") {
      expect(plan.startBy.getTime()).toBeGreaterThanOrEqual(
        new Date(monday4pm).setHours(0, 0, 0, 0)
      );
    }
  });

  it("declines to plan what it cannot know", () => {
    expect(planStart(null, 60, profile, monday4pm).kind).toBe("unknown");
    expect(planStart(new Date(2026, 8, 20), null, profile, monday4pm).kind).toBe("unknown");
  });

  it("treats a deadline already past as leaving no time", () => {
    const past = new Date(2026, 8, 1, 22, 0, 0);
    expect(planStart(past, 30, profile, monday4pm).kind).toBe("too-late");
  });
});

describe("warning a teacher before they publish into a crowded day", () => {
  const load = [
    { day: "2026-09-10", existing: 2, estimatedMins: 150 },
    { day: "2026-09-11", existing: 1, estimatedMins: 30 },
    { day: "2026-09-12", existing: 0, estimatedMins: 0 },
  ];

  it("warns loudly about a third piece of work on one day", () => {
    const w = deadlineCollisions(load, "2026-09-10", 60);
    expect(w?.severity).toBe("high");
    expect(w?.message).toMatch(/already has 2/);
  });

  it("mentions a second piece without alarm", () => {
    const w = deadlineCollisions(load, "2026-09-11", 20);
    expect(w?.severity).toBe("medium");
  });

  it("says nothing about a clear day", () => {
    expect(deadlineCollisions(load, "2026-09-12", 60)).toBeNull();
    expect(deadlineCollisions(load, "2026-09-20", 60)).toBeNull();
  });

  it("escalates on hours even when the count is low", () => {
    const heavy = [{ day: "2026-09-15", existing: 1, estimatedMins: 200 }];
    expect(deadlineCollisions(heavy, "2026-09-15", 30)?.severity).toBe("high");
  });

  it("warns rather than blocks", () => {
    // A teacher may have an excellent reason. The return type offers no way
    // to refuse the publish, which is the point.
    const w = deadlineCollisions(load, "2026-09-10", 60);
    expect(w).not.toHaveProperty("blocked");
    expect(w?.message).toMatch(/consider/i);
  });

  it("copes with an assignment carrying no estimate", () => {
    expect(() => deadlineCollisions(load, "2026-09-10", null)).not.toThrow();
  });
});

/* ── The direction of the link ─────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("insight reads the institution and never rewrites it", () => {
  const strip = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const index = strip("src/domains/insight/index.ts");
  const pure = strip("src/domains/insight/plan.ts");

  it("issues no writes at all", () => {
    // A deadline is not something Scholar gets to move because it decided the
    // week was busy. It can say so, to the student and the teacher, and that
    // is the whole of its authority.
    expect(index).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("keeps the arithmetic free of the database", () => {
    // A student told to start something on Thursday can reasonably ask why,
    // and the answer should be inspectable without a running system.
    expect(pure).not.toMatch(/from "@\/lib\/db"/);
    expect(pure).not.toMatch(/\bdb\.prepare\b/);
  });

  it("offers a teacher no way to be overruled", () => {
    // The warning type carries a message and a severity. Nothing in it can
    // refuse a publish, which is what keeps this advice rather than policy.
    expect(pure).toMatch(/severity: "high" \| "medium"/);
    expect(pure).not.toMatch(/blocked|forbid|reject/i);
  });
});
