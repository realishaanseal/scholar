import { describe, it, expect } from "vitest";
import {
  UPSERT_TASK_SQL, UPSERT_UPDATE_CLAUSE, ARCHIVE_TASK_SQL,
  INSTITUTION_OWNED_COLUMNS, PERSONAL_COLUMNS, EXTERNAL_SOURCE,
  projectedFields, shouldProject, evaluateSubmission,
  type ProjectableAssignment,
} from "@/domains/assessment";
import { quoteCamelIdentifiers } from "@/lib/sqlCase";

/*
  The projection is the seam between the institution and the student, and the
  promise it makes is that a sync never destroys personal planning. That
  promise is kept structurally — the update branch does not name the personal
  columns — so the tests here assert on the SQL itself rather than on
  behaviour observed after the fact. A test that only checked "the estimate
  survived one sync" would pass right up until someone added a column.
*/

const assignment = (over: Partial<ProjectableAssignment> = {}): ProjectableAssignment => ({
  id: "a1",
  title: "Problem set 4",
  instructions: "  Questions 1-12, show working.  ",
  dueAt: "2026-09-12T16:00:00.000Z",
  status: "published",
  estimatedMins: 75,
  courseCode: "PHY101",
  courseTitle: "Physics I",
  ...over,
});

describe("the update branch cannot touch personal planning", () => {
  it("names every institution-owned column", () => {
    for (const col of INSTITUTION_OWNED_COLUMNS) {
      expect(UPSERT_UPDATE_CLAUSE).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("names no personal column", () => {
    // The guarantee. Adding one of these to the update clause should fail the
    // build rather than quietly reset a student's own estimate on the next
    // time a teacher fixes a typo.
    for (const col of PERSONAL_COLUMNS) {
      expect(UPSERT_UPDATE_CLAUSE).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("still seeds the personal columns on first insert", () => {
    // They belong in the INSERT — the teacher's estimate is a reasonable
    // starting point, just not an ongoing authority.
    const insertList = UPSERT_TASK_SQL.slice(0, UPSERT_TASK_SQL.indexOf("VALUES"));
    expect(insertList).toMatch(/\bestimateMins\b/);
    expect(insertList).toMatch(/\bsubjectId\b/);
  });
});

describe("upsert statement shape", () => {
  it("repeats the partial index predicate in the conflict target", () => {
    // idx_homework_external is a partial unique index. Without the matching
    // WHERE, Postgres cannot infer it and the whole upsert fails at runtime.
    expect(UPSERT_TASK_SQL).toMatch(
      /ON CONFLICT \(userId, externalSource, externalId\) WHERE externalId IS NOT NULL/
    );
  });

  it("tags the row with the assignment source so a resync finds it again", () => {
    expect(UPSERT_TASK_SQL).toContain(`'${EXTERNAL_SOURCE}'`);
    expect(EXTERNAL_SOURCE).toBe("lms:assignment");
  });

  it("un-archives on re-publish rather than creating a second task", () => {
    expect(UPSERT_UPDATE_CLAUSE).toMatch(/archived_at = NULL/);
  });

  it("survives the camelCase quoting shim without double-quoting", () => {
    // These statements are written unquoted because the shim quotes them on
    // the way out. Hand-quoting as well would produce ""userId"" and fail.
    const out = quoteCamelIdentifiers(UPSERT_TASK_SQL);
    expect(out).not.toMatch(/""/);
    expect(out).toContain('"userId"');
    expect(out).toContain('"dueAt"');
    // All-caps keywords must be left alone.
    expect(out).toContain("EXCLUDED.title");
  });

  it("leaves the source literal intact through the shim", () => {
    // 'lms:assignment' is all lowercase, so the identifier rewriter has
    // nothing to grab. A camelCase literal here would be silently corrupted.
    expect(quoteCamelIdentifiers(UPSERT_TASK_SQL)).toContain("'lms:assignment'");
  });
});

describe("archiving", () => {
  it("archives rather than deletes", () => {
    expect(ARCHIVE_TASK_SQL).toMatch(/^\s*UPDATE homework/);
    expect(ARCHIVE_TASK_SQL).not.toMatch(/\bDELETE\b/);
  });

  it("only touches tasks projected from an assignment", () => {
    // A task the student typed themselves must never be swept up by a
    // teacher cancelling coursework.
    expect(ARCHIVE_TASK_SQL).toContain(`externalSource = '${EXTERNAL_SOURCE}'`);
  });

  it("does not re-archive something already archived", () => {
    expect(ARCHIVE_TASK_SQL).toMatch(/archived_at IS NULL/);
  });
});

describe("projected fields", () => {
  it("leads the title with the course code", () => {
    // A task list is sorted by urgency across every subject, so "Problem set
    // 4" on its own stops being identifiable the moment two courses set one.
    expect(projectedFields(assignment()).title).toBe("PHY101 — Problem set 4");
  });

  it("carries the instructions and the deadline verbatim", () => {
    const f = projectedFields(assignment());
    expect(f.details).toBe("Questions 1-12, show working.");
    expect(f.dueAt).toBe("2026-09-12T16:00:00.000Z");
  });

  it("uses the course as the subject, falling back to the code", () => {
    expect(projectedFields(assignment()).subject).toBe("Physics I");
    expect(projectedFields(assignment({ courseTitle: "" })).subject).toBe("PHY101");
  });

  it("passes the teacher estimate through as the seed", () => {
    expect(projectedFields(assignment()).estimateMins).toBe(75);
    expect(projectedFields(assignment({ estimatedMins: null })).estimateMins).toBeNull();
  });
});

describe("what gets projected", () => {
  it("projects published work only", () => {
    // A draft is the teacher still writing. Projecting it would put homework
    // on a dashboard that nobody has decided to set.
    expect(shouldProject({ status: "published" })).toBe(true);
    expect(shouldProject({ status: "draft" })).toBe(false);
    expect(shouldProject({ status: "archived" })).toBe(false);
  });
});

describe("submission window", () => {
  const base = {
    availableFrom: "2026-09-01T00:00:00.000Z",
    dueAt: "2026-09-12T16:00:00.000Z",
    closesAt: "2026-09-15T16:00:00.000Z",
    latePolicy: "accept" as const,
  };
  const at = (iso: string) => new Date(iso);

  it("refuses work before the window opens", () => {
    expect(evaluateSubmission(base, at("2026-08-30T00:00:00.000Z")))
      .toEqual({ accepted: false, reason: "not-open-yet" });
  });

  it("accepts on time", () => {
    expect(evaluateSubmission(base, at("2026-09-10T00:00:00.000Z")))
      .toEqual({ accepted: true, late: false });
  });

  it("accepts after the deadline but flags it late", () => {
    // Late and closed are separate questions: a deadline that also slams the
    // door leaves no way to accept late work at a penalty.
    expect(evaluateSubmission(base, at("2026-09-13T00:00:00.000Z")))
      .toEqual({ accepted: true, late: true });
  });

  it("refuses once the cutoff passes", () => {
    expect(evaluateSubmission(base, at("2026-09-16T00:00:00.000Z")))
      .toEqual({ accepted: false, reason: "closed" });
  });

  it("refuses late work when the policy rejects it", () => {
    expect(evaluateSubmission({ ...base, latePolicy: "reject" }, at("2026-09-13T00:00:00.000Z")))
      .toEqual({ accepted: false, reason: "late-rejected" });
  });

  it("treats an assignment with no dates as always open and never late", () => {
    const open = { availableFrom: null, dueAt: null, closesAt: null, latePolicy: "accept" as const };
    expect(evaluateSubmission(open, at("2030-01-01T00:00:00.000Z")))
      .toEqual({ accepted: true, late: false });
  });
});
