import { describe, it, expect } from "vitest";
import {
  deadlineSentence, deadlineView, safeZone, wallClockToInstant, zoneAbbrev,
} from "@/lib/time";

/*
  A deadline is the highest-stakes sentence this product renders. Getting it
  wrong does not produce an obviously broken screen — it produces a student who
  believes they have another day, and a late mark they did not earn. Tested on
  the cases where a plausible implementation is confidently wrong.
*/

/** 2026-09-11 18:29 UTC — Friday 23:59 in Kolkata, 20:29 in Berlin. */
const friday = new Date(Date.UTC(2026, 8, 11, 18, 29));

describe("one instant, two sentences", () => {
  it("shows one sentence when the reader is where the institution is", () => {
    const v = deadlineView(friday, "Asia/Kolkata", "Asia/Kolkata");
    expect(v.differs).toBe(false);
    expect(deadlineSentence(v)).toBe(`Due ${v.institution.text}`);
  });

  it("shows both when they differ", () => {
    const v = deadlineView(friday, "Asia/Kolkata", "Europe/Berlin");
    expect(v.differs).toBe(true);
    expect(v.institution.text).toMatch(/23:59/);
    expect(v.viewer.text).toMatch(/20:29/);
  });

  it("leads with the reader's time and keeps the rule in view", () => {
    // The reader plans against their own clock and is held to the school's.
    const s = deadlineSentence(deadlineView(friday, "Asia/Kolkata", "Europe/Berlin"));
    expect(s.indexOf("20:29")).toBeLessThan(s.indexOf("23:59"));
    expect(s).toMatch(/your time/);
  });

  it("treats a reader with no zone as being at their institution", () => {
    // True of almost everyone, and it produces one sentence rather than two.
    const v = deadlineView(friday, "Asia/Kolkata", null);
    expect(v.differs).toBe(false);
    expect(v.viewer.zone).toBe("Asia/Kolkata");
  });

  it("says nothing extra when two zone names agree on the clock", () => {
    // Europe/Dublin and Europe/London are different strings and the same time
    // for most of the year. "Also 23:59 your time" is noise dressed as help.
    const v = deadlineView(friday, "Europe/London", "Europe/Dublin");
    expect(v.differs).toBe(false);
  });
});

describe("a deadline that lands on a different day", () => {
  /** 2026-09-11 20:00 UTC — late Friday in London, early Saturday in Sydney. */
  const lateFriday = new Date(Date.UTC(2026, 8, 11, 20, 0));

  it("notices the calendar day is not the same", () => {
    const v = deadlineView(lateFriday, "Europe/London", "Australia/Sydney");
    expect(v.crossesDay).toBe(true);
  });

  it("says so in words", () => {
    // The sentence that stops someone handing in a day late while believing
    // they were early.
    const s = deadlineSentence(deadlineView(lateFriday, "Europe/London", "Australia/Sydney"));
    expect(s).toMatch(/different day/);
  });

  it("stays quiet when the day matches", () => {
    const v = deadlineView(friday, "Asia/Kolkata", "Europe/Berlin");
    expect(v.crossesDay).toBe(false);
    expect(deadlineSentence(v)).not.toMatch(/different day/);
  });
});

describe("a bad zone degrades instead of exploding", () => {
  it("falls back rather than throwing", () => {
    // An invalid zone fails inside a formatter, at render time, on the night
    // something is due. A wrong label beats a blank page.
    expect(() => deadlineView(friday, "Mars/Olympus", "Also/Fake")).not.toThrow();
    expect(safeZone("Mars/Olympus")).toBe("UTC");
    expect(safeZone(null)).toBe("UTC");
    expect(safeZone(undefined, "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("keeps a valid zone", () => {
    expect(safeZone("America/New_York")).toBe("America/New_York");
  });

  it("names the zone on the date in question", () => {
    // Northern-hemisphere summer time, so the abbreviation is the summer one.
    expect(zoneAbbrev(friday, "Europe/Berlin")).toMatch(/GMT\+2|CEST/);
  });
});

describe("the wall clock a teacher typed means the institution's clock", () => {
  it("resolves a typed time against the school's zone, not the browser's", () => {
    // A teacher setting Friday 23:59 from an airport in Singapore is setting
    // 23:59 at their school in Kolkata.
    const at = wallClockToInstant("2026-09-11T23:59", "Asia/Kolkata");
    expect(at.toISOString()).toBe("2026-09-11T18:29:00.000Z");
  });

  it("round-trips through the view it will be displayed by", () => {
    const at = wallClockToInstant("2026-09-11T23:59", "Asia/Kolkata");
    expect(deadlineView(at, "Asia/Kolkata", "Asia/Kolkata").institution.text).toMatch(/23:59/);
  });

  it("gets the offset right across a DST boundary", () => {
    // 2026-03-29 is the spring transition in Europe. A single-pass conversion
    // lands an hour out here; the correcting second pass does not.
    const before = wallClockToInstant("2026-03-28T12:00", "Europe/Berlin");
    const after = wallClockToInstant("2026-03-30T12:00", "Europe/Berlin");
    expect(before.toISOString()).toBe("2026-03-28T11:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-30T10:00:00.000Z");
  });

  it("handles a zone with a half-hour offset", () => {
    expect(wallClockToInstant("2026-09-11T09:00", "Asia/Kathmandu").toISOString())
      .toBe("2026-09-11T03:15:00.000Z");
  });

  it("returns an invalid date rather than a wrong one", () => {
    expect(Number.isNaN(wallClockToInstant("not a date", "UTC").getTime())).toBe(true);
  });
});
