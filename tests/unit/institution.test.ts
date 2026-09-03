import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { courseConcerns, markingHealth } from "@/domains/insight/institution";

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const now = new Date();

describe("marking turnaround, from the student's side of it", () => {
  it("reports the median rather than the mean", () => {
    // One piece left for a term would drag an average into meaninglessness
    // while thirty next-day returns sat underneath it.
    const items = [
      { submittedAt: iso(10), gradedAt: iso(9) },
      { submittedAt: iso(10), gradedAt: iso(9) },
      { submittedAt: iso(100), gradedAt: iso(1) },
    ];
    const h = markingHealth(items, now);
    expect(h.medianDays).toBe(1);
  });

  it("surfaces the longest current wait beside the median", () => {
    // A median of one day is no comfort to the person waiting five weeks, and
    // an administrator reading only the median would never learn they exist.
    const items = [
      { submittedAt: iso(3), gradedAt: iso(2) },
      { submittedAt: iso(35), gradedAt: null },
    ];
    const h = markingHealth(items, now);
    expect(h.medianDays).toBe(1);
    expect(h.worstWaitDays).toBeGreaterThanOrEqual(34);
    expect(h.outstanding).toBe(1);
  });

  it("counts what has been returned as a share of what came in", () => {
    const items = [
      { submittedAt: iso(5), gradedAt: iso(4) },
      { submittedAt: iso(5), gradedAt: iso(4) },
      { submittedAt: iso(5), gradedAt: null },
      { submittedAt: iso(5), gradedAt: null },
    ];
    expect(markingHealth(items, now).returnRate).toBe(0.5);
  });

  it("says nothing rather than zero when nothing has been marked", () => {
    const h = markingHealth([{ submittedAt: iso(2), gradedAt: null }], now);
    expect(h.medianDays).toBeNull();
    expect(h.returnRate).toBe(0);
  });

  it("survives an institution that has done nothing yet", () => {
    const h = markingHealth([], now);
    expect(h.medianDays).toBeNull();
    expect(h.worstWaitDays).toBeNull();
    expect(h.returnRate).toBeNull();
  });

  it("ignores work that was never handed in", () => {
    // Nothing was submitted, so nobody is waiting and no turnaround exists.
    const h = markingHealth([{ submittedAt: null, gradedAt: null }], now);
    expect(h.outstanding).toBe(0);
    expect(h.marked).toBe(0);
  });

  it("discards a mark recorded before the work arrived", () => {
    // Clock skew or a backfill. A negative turnaround is not a fast one.
    const h = markingHealth([{ submittedAt: iso(1), gradedAt: iso(5) }], now);
    expect(h.marked).toBe(0);
  });
});

describe("which courses need an administrator's attention", () => {
  const base = { courseId: "c1", code: "PHY101", title: "Physics", published: 5 };

  it("raises a concern about work left unmarked for weeks", () => {
    const [c] = courseConcerns([{ ...base, outstanding: 3, worstWaitDays: 25 }]);
    expect(c.concern).toMatch(/25 days/);
  });

  it("raises one about a backlog by size", () => {
    const [c] = courseConcerns([{ ...base, outstanding: 40, worstWaitDays: 4 }]);
    expect(c.concern).toMatch(/40 pieces/);
  });

  it("notices a course where nothing has been set", () => {
    const [c] = courseConcerns([
      { ...base, published: 0, outstanding: 0, worstWaitDays: null },
    ]);
    expect(c.concern).toMatch(/no work has been set/i);
  });

  it("stays quiet about a healthy course", () => {
    const [c] = courseConcerns([{ ...base, outstanding: 2, worstWaitDays: 3 }]);
    expect(c.concern).toBeNull();
  });

  it("concerns itself with the institution's conduct, never a student's", () => {
    // Every message is about what the institution has or has not done.
    const all = courseConcerns([
      { ...base, outstanding: 40, worstWaitDays: 30 },
      { ...base, published: 0, outstanding: 0, worstWaitDays: null },
    ]);
    for (const c of all) {
      if (c.concern) expect(c.concern).not.toMatch(/student|pupil|behind|failing|risk/i);
    }
  });
});

describe("an administrator may see what the institution did, not how a student lives", () => {
  const source = readFileSync(
    join(process.cwd(), "src/domains/insight/institution.ts"),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("cannot reach the personal layer", () => {
    // Not filtered, not anonymised — absent. "Engagement is down in Year 9"
    // is a surveillance tool wearing a pastoral coat, and the data being in
    // the same database is not a reason to build it.
    for (const t of [
      "homework",
      "task_events",
      "academic_profile",
      "focusSeconds",
      "study_sessions",
      "timetable",
      "dismissed_signals",
    ]) {
      expect(source).not.toMatch(new RegExp(`\\b${t}\\b`));
    }
  });

  it("touches no database at all", () => {
    expect(source).not.toMatch(/from "@\/lib\/db"/);
    expect(source).not.toMatch(/\bdb\.prepare\b/);
  });

  it("computes nothing per named student", () => {
    // The types here are about work and courses. No function returns a
    // student-shaped row, because no admin screen should rank people.
    expect(source).not.toMatch(/userId|studentId|user_id/);
  });
});
