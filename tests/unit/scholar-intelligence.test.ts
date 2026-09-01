import { describe, it, expect } from "vitest";
import { availableMinutesBefore, capacityForDay, minutesLeftToday } from "@/lib/scholar/availability";
import { assessRisk, expectedRemainingMins } from "@/lib/scholar/priority";
import { DEFAULT_AVAILABILITY, type ScorableTask, type SubjectPace } from "@/lib/scholar/types";

/*
  These engines are the part of Scholar the LMS expansion is meant to point at
  institutional data, so their behaviour is pinned here before any of that
  refactoring starts.

  Every date is built with the local-time constructor (year, monthIndex, day,
  hour) rather than an ISO string, because the code under test reasons in local
  time via setHours(). An ISO literal would make these assertions pass or fail
  depending on the machine's timezone.

  The profile under test is the default: 120 weekday minutes, 240 at weekends,
  studying between 16:00 and 22:00.
*/

const P = DEFAULT_AVAILABILITY;

/** Tue 1 Sep 2026, 10:00 local. */
const TUE_10AM = new Date(2026, 8, 1, 10, 0, 0);
/** Wed 2 Sep 2026, 09:00 local — before that day's study window opens. */
const WED_9AM = new Date(2026, 8, 2, 9, 0, 0);

function task(over: Partial<ScorableTask> = {}): ScorableTask {
  return {
    id: "t1",
    title: "Task",
    status: "todo",
    dueAt: WED_9AM.toISOString(),
    estimateMins: 60,
    priority: "normal",
    subject: "Physics",
    ...over,
  };
}

describe("availability", () => {
  it("uses the weekend allowance on Saturday and Sunday", () => {
    expect(capacityForDay(new Date(2026, 8, 5), P)).toBe(P.weekendMins); // Sat
    expect(capacityForDay(new Date(2026, 8, 6), P)).toBe(P.weekendMins); // Sun
    expect(capacityForDay(new Date(2026, 8, 1), P)).toBe(P.weekdayMins); // Tue
  });

  it("counts no time toward a deadline that has already passed", () => {
    expect(availableMinutesBefore(TUE_10AM, P, WED_9AM)).toBe(0);
  });

  it("does not count hours outside the declared study window", () => {
    // 02:00 -> 08:00 sits entirely before the 16:00 window opens. Wall-clock
    // arithmetic would wrongly report six hours of study time here.
    const at2am = new Date(2026, 8, 1, 2, 0, 0);
    const at8am = new Date(2026, 8, 1, 8, 0, 0);
    expect(availableMinutesBefore(at8am, P, at2am)).toBe(0);
  });

  it("caps a long open window at the day's declared capacity", () => {
    // 16:00 -> 22:00 is a 360-minute window, but the student only claims 120.
    const at4pm = new Date(2026, 8, 1, 16, 0, 0);
    const at10pm = new Date(2026, 8, 1, 22, 0, 0);
    expect(availableMinutesBefore(at10pm, P, at4pm)).toBe(P.weekdayMins);
  });

  it("accumulates across days up to the deadline", () => {
    // Tue 10:00 -> Wed 09:00 crosses one full study window (Tue evening).
    // Wednesday's window has not opened by 09:00, so it contributes nothing.
    expect(availableMinutesBefore(WED_9AM, P, TUE_10AM)).toBe(P.weekdayMins);
  });

  it("reports nothing left once the study window has closed", () => {
    const at11pm = new Date(2026, 8, 1, 23, 0, 0);
    expect(minutesLeftToday(P, at11pm)).toBe(0);
  });
});

describe("expectedRemainingMins", () => {
  it("subtracts time already logged in focus mode", () => {
    expect(expectedRemainingMins(task({ estimateMins: 240, focusMins: 200 }))).toBe(40);
  });

  it("never returns a negative remainder when the estimate is overrun", () => {
    expect(expectedRemainingMins(task({ estimateMins: 30, focusMins: 200 }))).toBe(0);
  });

  it("falls back to a modest default when the AI produced no estimate", () => {
    expect(expectedRemainingMins(task({ estimateMins: null }))).toBe(40);
  });

  it("lets one data point nudge the estimate rather than dictate it", () => {
    // calibration 2.0 means this subject historically takes twice as long. With
    // a single sample that should move the number a little, not double it.
    const thin: SubjectPace = {
      subject: "Physics", calibration: 2, averageActualMins: 120, onTimeRate: 1, sampleSize: 1,
    };
    expect(expectedRemainingMins(task({ estimateMins: 100 }), thin)).toBe(120); // +20%, not +100%
  });

  it("applies the full calibration once there is enough history", () => {
    const solid: SubjectPace = {
      subject: "Physics", calibration: 2, averageActualMins: 120, onTimeRate: 1, sampleSize: 5,
    };
    expect(expectedRemainingMins(task({ estimateMins: 100 }), solid)).toBe(200);
  });
});

describe("assessRisk", () => {
  it("scores by work-against-available-time, not deadline proximity", () => {
    // The thesis of the engine: these two tasks share a deadline, so anything
    // keyed on proximity alone would rank them identically.
    const big = assessRisk(task({ estimateMins: 240 }), { now: TUE_10AM, profile: P });
    const small = assessRisk(task({ estimateMins: 10 }), { now: TUE_10AM, profile: P });

    expect(big.score).toBeGreaterThan(small.score);
    expect(big.level).toBe("critical");
    expect(small.level).toBe("low");
  });

  it("says plainly when there is not enough time left", () => {
    const r = assessRisk(task({ estimateMins: 240 }), { now: TUE_10AM, profile: P });
    expect(r.remainingMins).toBe(240);
    expect(r.availableMins).toBe(120);
    expect(r.reason).toMatch(/not enough time/i);
  });

  it("treats anything overdue as critical and startable immediately", () => {
    const r = assessRisk(task({ dueAt: TUE_10AM.toISOString() }), { now: WED_9AM, profile: P });
    expect(r.level).toBe("critical");
    expect(r.score).toBe(100);
    expect(r.recommendedStart).toEqual(WED_9AM);
    expect(r.reason).toMatch(/overdue/i);
  });

  it("retires a completed task from scoring entirely", () => {
    const r = assessRisk(task({ status: "done" }), { now: TUE_10AM, profile: P });
    expect(r.level).toBe("none");
    expect(r.score).toBe(0);
  });

  it("falls back to manual priority when there is no deadline", () => {
    const opts = { now: TUE_10AM, profile: P };
    const high = assessRisk(task({ dueAt: null, priority: "high" }), opts);
    const normal = assessRisk(task({ dueAt: null, priority: "normal" }), opts);
    const low = assessRisk(task({ dueAt: null, priority: "low" }), opts);

    expect(high.score).toBeGreaterThan(normal.score);
    expect(normal.score).toBeGreaterThan(low.score);
    // Still low risk: no deadline means no time pressure, whatever the flag says.
    expect(high.level).toBe("low");
  });

  it("keeps the priority nudge from overwhelming the time signal", () => {
    // A trivial task marked high must not out-rank a genuinely squeezed one.
    const trivialButFlagged = assessRisk(
      task({ estimateMins: 10, priority: "high" }), { now: TUE_10AM, profile: P },
    );
    const genuinelyTight = assessRisk(
      task({ estimateMins: 240, priority: "low" }), { now: TUE_10AM, profile: P },
    );
    expect(genuinelyTight.score).toBeGreaterThan(trivialButFlagged.score);
  });

  it("degrades gracefully when the deadline cannot be parsed", () => {
    const r = assessRisk(task({ dueAt: "not-a-date" }), { now: TUE_10AM, profile: P });
    expect(r.level).toBe("low");
    expect(r.reason).toBeTruthy();
  });

  it("always explains itself", () => {
    // The risk model is required to be transparent, so an unexplained score is
    // a defect regardless of whether the number is right.
    const cases: ScorableTask[] = [
      task({ estimateMins: 240 }),
      task({ estimateMins: 10 }),
      task({ dueAt: null }),
      task({ status: "done" }),
      task({ dueAt: TUE_10AM.toISOString() }),
    ];
    for (const c of cases) {
      const r = assessRisk(c, { now: TUE_10AM, profile: P });
      expect(r.reason.trim().length).toBeGreaterThan(0);
    }
  });
});
