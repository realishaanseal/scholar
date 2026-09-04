import { describe, it, expect } from "vitest";
import {
  calibration, MIN_FINISHED, orderOfWork, timeBudget, type WorkItem,
} from "@/domains/insight/week";
import type { AvailabilityProfile } from "@/lib/scholar/types";

/*
  A student told to do three things in a particular order will reasonably want
  to know why, and occasionally want to argue. Tested on the cases where the
  obvious answer — sort by deadline — is the one that gets somebody into
  trouble.
*/

const profile: AvailabilityProfile = {
  weekdayMins: 120,
  weekendMins: 240,
  studyStartHour: 16,
  studyEndHour: 22,
  restDays: [0, 6],
  timezone: null,
};

/** A Monday at 16:00, the start of the study window. */
const monday = new Date(2026, 8, 7, 16, 0, 0);
const at = (day: number, hour = 22) => new Date(2026, 8, day, hour, 0, 0);

const item = (over: Partial<WorkItem> = {}): WorkItem => ({
  id: "w" + Math.random().toString(36).slice(2, 7),
  title: "Something",
  courseCode: "PHY101",
  sectionId: "s1",
  dueAt: at(11),
  estimateMins: 60,
  ...over,
});

describe("the order to do things in", () => {
  it("does not simply sort by deadline", () => {
    // The case that matters. A four-hour essay due Friday needs starting
    // before a twenty-minute worksheet due Wednesday, and deadline order says
    // the opposite — which is exactly what a student does on their own.
    const worksheet = item({ title: "Worksheet", dueAt: at(9), estimateMins: 20 });
    const essay = item({ title: "Essay", dueAt: at(11), estimateMins: 480 });

    const order = orderOfWork([worksheet, essay], profile, monday);
    expect(order[0].title).toBe("Essay");
  });

  it("puts the tightest thing first when deadlines agree with slack", () => {
    const soon = item({ title: "Soon", dueAt: at(8), estimateMins: 110 });
    const later = item({ title: "Later", dueAt: at(18), estimateMins: 30 });
    expect(orderOfWork([soon, later], profile, monday)[0].title).toBe("Soon");
  });

  it("counts everything due sooner against a later deadline", () => {
    // The worksheet is not competing with the essay for Friday's hours alone;
    // it is competing for every hour before Wednesday, and so is any part of
    // the essay done early.
    const a = item({ title: "A", dueAt: at(9), estimateMins: 200 });
    const b = item({ title: "B", dueAt: at(10), estimateMins: 200 });
    const order = orderOfWork([a, b], profile, monday);
    const bSlack = order.find((o) => o.title === "B")!;
    const aSlack = order.find((o) => o.title === "A")!;
    expect(bSlack.slackMins).toBeLessThan(aSlack.availableMins);
  });

  it("says a piece is at risk rather than ordering it and going quiet", () => {
    const impossible = item({ title: "Impossible", dueAt: at(8), estimateMins: 5000 });
    const [first] = orderOfWork([impossible], profile, monday);
    expect(first.atRisk).toBe(true);
    expect(first.reason).toMatch(/hours short/);
  });

  it("explains every position in words", () => {
    const order = orderOfWork(
      [item({ dueAt: at(9) }), item({ dueAt: at(11) }), item({ dueAt: at(15) })],
      profile, monday
    );
    for (const o of order) expect(o.reason.length).toBeGreaterThan(10);
  });

  it("leaves out work it cannot reason about", () => {
    // No deadline or no estimate means no slack, and inventing one would be
    // the kind of confident guess this whole module exists to avoid.
    const order = orderOfWork(
      [item({ dueAt: null }), item({ estimateMins: null }), item()],
      profile, monday
    );
    expect(order).toHaveLength(1);
  });
});

describe("the budget, in hours", () => {
  it("adds up outstanding work against real study time", () => {
    const b = timeBudget(
      [item({ estimateMins: 120, dueAt: at(9) }), item({ estimateMins: 60, dueAt: at(11) })],
      profile, monday
    );
    expect(b.workMins).toBe(180);
    expect(b.availableMins).toBeGreaterThan(0);
  });

  it("reports a shortfall rather than softening it", () => {
    const b = timeBudget([item({ estimateMins: 5000, dueAt: at(9) })], profile, monday);
    expect(b.slackMins).toBeLessThan(0);
  });

  it("separates what is due next from everything outstanding", () => {
    // "Nine hours of work" is not actionable. "Two hours before Wednesday" is.
    const b = timeBudget(
      [item({ estimateMins: 120, dueAt: at(9) }), item({ estimateMins: 300, dueAt: at(25) })],
      profile, monday
    );
    expect(b.workDueNext).toBe(120);
    expect(b.workMins).toBe(420);
    expect(b.availableBeforeNext).toBeLessThan(b.availableMins);
  });

  it("counts unestimated work rather than guessing at it", () => {
    // A total built partly from invented numbers is worse than one that
    // admits its edges.
    const b = timeBudget(
      [item({ estimateMins: null }), item({ estimateMins: 60 })],
      profile, monday
    );
    expect(b.unestimated).toBe(1);
    expect(b.workMins).toBe(60);
  });

  it("survives having nothing due", () => {
    const b = timeBudget([item({ dueAt: null, estimateMins: 60 })], profile, monday);
    expect(b.availableMins).toBe(0);
    expect(b.workMins).toBe(60);
  });
});

describe("what your estimates have been worth", () => {
  const rows = (subject: string, pairs: Array<[number, number]>) =>
    pairs.map(([estimateMins, actualMins]) => ({ subject, estimateMins, actualMins }));

  it("says how far out they run, per subject", () => {
    const c = calibration(rows("Physics", [[60, 90], [60, 90], [60, 90]]));
    expect(c.receipts[0].ratio).toBe(1.5);
    expect(c.receipts[0].occasions).toBe(3);
  });

  it("will not name a subject on thin evidence", () => {
    // One bad afternoon is an anecdote.
    const c = calibration(rows("Physics", [[60, 180], [60, 180]]));
    expect(c.receipts[0].occasions).toBeLessThan(MIN_FINISHED);
    expect(c.worst).toBeNull();
  });

  it("stays quiet when somebody is about right", () => {
    // Being ten percent out is being right, and saying so would be nagging.
    const c = calibration(rows("Physics", [[60, 66], [60, 63], [60, 65]]));
    expect(c.worst).toBeNull();
  });

  it("names the subject furthest adrift", () => {
    const c = calibration([
      ...rows("Physics", [[60, 120], [60, 120], [60, 120]]),
      ...rows("English", [[60, 62], [60, 58], [60, 60]]),
    ]);
    expect(c.worst?.subject).toBe("Physics");
    expect(c.worst?.ratio).toBe(2);
  });

  it("notices somebody who overestimates too", () => {
    // Consistently finishing early is also worth knowing, and a module that
    // only ever says "you are slower than you think" is a nagging one.
    const c = calibration(rows("Art", [[120, 60], [120, 60], [120, 60]]));
    expect(c.worst?.ratio).toBe(0.5);
  });

  it("ignores work that was never estimated", () => {
    const c = calibration([
      { subject: "Physics", estimateMins: 0, actualMins: 90 },
      ...rows("Physics", [[60, 90]]),
    ]);
    expect(c.receipts[0].occasions).toBe(1);
  });

  it("survives having nothing finished", () => {
    const c = calibration([]);
    expect(c.receipts).toEqual([]);
    expect(c.overall).toBeNull();
    expect(c.worst).toBeNull();
  });
});
