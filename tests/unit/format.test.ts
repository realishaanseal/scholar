import { describe, it, expect } from "vitest";
import { daysUntil, urgencyOf, toLocalInputValue, fromLocalInputValue } from "@/lib/format";

/*
  Deadline bucketing decides ordering on the dashboard and the colour of every
  due chip, so the boundaries are pinned rather than left to be rediscovered.

  Dates use the local-time constructor throughout: urgencyOf compares against
  local midnight, so ISO literals would make these timezone-dependent.
*/

/** Tue 1 Sep 2026, 12:00 local. */
const NOW = new Date(2026, 8, 1, 12, 0, 0);
const at = (dayOffset: number, hour = 12, min = 0) =>
  new Date(2026, 8, 1 + dayOffset, hour, min, 0);

describe("daysUntil", () => {
  it("counts calendar days, not elapsed 24-hour periods", () => {
    // 23:00 tonight is under twelve hours away but is still "today".
    expect(daysUntil(at(0, 23), NOW)).toBe(0);
    // 01:00 tomorrow is closer in clock time than 23:00 tonight, yet is a day out.
    expect(daysUntil(at(1, 1), NOW)).toBe(1);
  });

  it("goes negative for dates already past", () => {
    expect(daysUntil(at(-3), NOW)).toBe(-3);
  });
});

describe("urgencyOf", () => {
  it("returns none for a missing or unreadable deadline", () => {
    expect(urgencyOf(null, NOW)).toBe("none");
    expect(urgencyOf("not-a-date", NOW)).toBe("none");
  });

  it("buckets by distance from today", () => {
    expect(urgencyOf(at(0, 9), NOW)).toBe("overdue"); // 09:00 already gone
    expect(urgencyOf(at(0, 23), NOW)).toBe("today");
    expect(urgencyOf(at(1), NOW)).toBe("tomorrow");
    expect(urgencyOf(at(3), NOW)).toBe("soon");
    expect(urgencyOf(at(10), NOW)).toBe("later");
  });

  it("treats any past instant as overdue, however recent", () => {
    const aMinuteAgo = new Date(NOW.getTime() - 60_000);
    expect(urgencyOf(aMinuteAgo, NOW)).toBe("overdue");
  });

  it("puts the soon/later boundary at three days", () => {
    expect(urgencyOf(at(3), NOW)).toBe("soon");
    expect(urgencyOf(at(4), NOW)).toBe("later");
  });
});

describe("datetime-local round trip", () => {
  it("survives a round trip through the form control format", () => {
    const iso = at(2, 14, 30).toISOString();
    const restored = fromLocalInputValue(toLocalInputValue(iso));
    expect(restored).not.toBeNull();
    // The control has minute precision, so seconds are expected to be dropped.
    expect(new Date(restored!).getTime()).toBe(at(2, 14, 30).getTime());
  });

  it("treats empty and unparseable input as no deadline", () => {
    expect(toLocalInputValue(null)).toBe("");
    expect(toLocalInputValue("not-a-date")).toBe("");
    expect(fromLocalInputValue("")).toBeNull();
    expect(fromLocalInputValue("not-a-date")).toBeNull();
  });
});
