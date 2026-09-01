import { describe, it, expect } from "vitest";
import { toActor } from "@/domains/identity";
import { can } from "@/lib/authz";
import {
  courseCodeSchema, createCourseSchema, createSectionSchema, createLessonSchema,
  moduleVisibility,
} from "@/domains/courses";

/*
  The point of this phase is that authorization finally has something to bind
  to. Until section_teachers and enrollments existed, a TEACHER membership
  reached no section and every course-bound check was denied; these tests are
  what confirm the binding now works AND still refuses everything it should.
*/

const ORG = "org-a";
const OTHER_ORG = "org-b";
const SECTION = "sec-phys-a";
const COURSE = "course-phys";

const membership = (role: string, org = ORG) => ({
  organization_id: org, role, department_id: null, status: "active",
});
const sectionRow = (over: Partial<{ organization_id: string; course_id: string; course_section_id: string }> = {}) => ({
  organization_id: ORG, course_id: COURSE, course_section_id: SECTION, ...over,
});

describe("teaching assignment now grants course-bound permissions", () => {
  it("lets a teacher grade the section they are assigned to", () => {
    const actor = toActor("u1", {
      memberships: [membership("TEACHER")],
      teaching: [sectionRow()],
    });
    expect(can(actor, "assignment:grade", { organizationId: ORG, courseSectionId: SECTION })).toBe(true);
  });

  it("still refuses a section they are not assigned to", () => {
    const actor = toActor("u1", {
      memberships: [membership("TEACHER")],
      teaching: [sectionRow()],
    });
    expect(can(actor, "assignment:grade", { organizationId: ORG, courseSectionId: "sec-other" }))
      .toBe(false);
  });

  it("resolves a course-level check from the section's course", () => {
    // course_id rides along on the teaching row precisely so a caller that
    // names only the course does not have to enumerate its sections.
    const actor = toActor("u1", {
      memberships: [membership("TEACHER")],
      teaching: [sectionRow()],
    });
    expect(can(actor, "assignment:create", { organizationId: ORG, courseId: COURSE })).toBe(true);
    expect(can(actor, "assignment:create", { organizationId: ORG, courseId: "course-chem" })).toBe(false);
  });

  it("does not carry a teaching assignment across institutions", () => {
    // Same section id in a different tenant. Without the organization
    // comparison this is exactly how an id collision would grant access.
    const actor = toActor("u1", {
      memberships: [membership("TEACHER"), membership("TEACHER", OTHER_ORG)],
      teaching: [sectionRow()],
    });
    expect(can(actor, "assignment:grade", { organizationId: OTHER_ORG, courseSectionId: SECTION }))
      .toBe(false);
  });
});

describe("enrollment", () => {
  it("gives an enrolled student access to their section", () => {
    const actor = toActor("s1", {
      memberships: [membership("STUDENT")],
      enrollments: [sectionRow()],
    });
    expect(can(actor, "submission:create", { organizationId: ORG, courseSectionId: SECTION })).toBe(true);
  });

  it("gives a dropped student nothing", () => {
    // resolveActor only selects active rows, so a dropped enrollment never
    // reaches the actor. Simulated here by the row simply being absent.
    const actor = toActor("s1", { memberships: [membership("STUDENT")], enrollments: [] });
    expect(can(actor, "submission:create", { organizationId: ORG, courseSectionId: SECTION })).toBe(false);
    expect(can(actor, "assignment:view", { organizationId: ORG, courseSectionId: SECTION })).toBe(false);
  });

  it("does not let enrollment confer teaching rights", () => {
    const actor = toActor("s1", {
      memberships: [membership("STUDENT")],
      enrollments: [sectionRow()],
    });
    expect(can(actor, "assignment:grade", { organizationId: ORG, courseSectionId: SECTION })).toBe(false);
    expect(can(actor, "grade:modify", { organizationId: ORG, courseSectionId: SECTION })).toBe(false);
  });

  it("separates the sections a person teaches from the ones they study", () => {
    const both = toActor("u1", {
      memberships: [membership("TEACHER"), membership("STUDENT")],
      teaching: [sectionRow({ course_section_id: "sec-teaches" })],
      enrollments: [sectionRow({ course_section_id: "sec-studies" })],
    });
    expect(can(both, "grade:publish", { organizationId: ORG, courseSectionId: "sec-teaches" })).toBe(true);
    expect(can(both, "grade:publish", { organizationId: ORG, courseSectionId: "sec-studies" })).toBe(false);
  });
});

describe("teaching assistant", () => {
  it("grades but cannot publish, even in their own section", () => {
    const ta = toActor("t1", {
      memberships: [membership("TEACHING_ASSISTANT")],
      teaching: [sectionRow()],
    });
    const scope = { organizationId: ORG, courseSectionId: SECTION };
    expect(can(ta, "assignment:grade", scope)).toBe(true);
    expect(can(ta, "grade:publish", scope)).toBe(false);
  });
});

describe("course code normalisation", () => {
  it("uppercases and trims so the unique constraint means what people expect", () => {
    // Without this, PHY101 and phy101 would be two different courses.
    expect(courseCodeSchema.parse("  phy101 ")).toBe("PHY101");
    expect(courseCodeSchema.parse("cs 101")).toBe("CS 101");
  });

  it("rejects codes that are not codes", () => {
    for (const bad of ["", "x", "-leading", "has/slash", "sym@bol"]) {
      expect(courseCodeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("course and lesson input", () => {
  it("defaults a new course to no department and no credits", () => {
    const c = createCourseSchema.parse({ code: "phy101", title: "Physics I" });
    expect(c).toMatchObject({ code: "PHY101", departmentId: null, credits: null, description: "" });
  });

  it("rejects credit values that are almost certainly typos", () => {
    expect(createCourseSchema.safeParse({ code: "P1", title: "Physics", credits: 3.7 }).success).toBe(false);
    expect(createCourseSchema.safeParse({ code: "P1", title: "Physics", credits: -1 }).success).toBe(false);
    expect(createCourseSchema.safeParse({ code: "P1", title: "Physics", credits: 3.5 }).success).toBe(true);
  });

  it("requires a section to name both a course and a term", () => {
    expect(createSectionSchema.safeParse({ courseId: "c1", name: "A" }).success).toBe(false);
    expect(createSectionSchema.safeParse({ courseId: "c1", termId: "t1", name: "A" }).success).toBe(true);
  });

  it("rejects a lesson link that is not a URL", () => {
    const bad = createLessonSchema.safeParse({ moduleId: "m1", title: "Watch this", url: "not a url" });
    expect(bad.success).toBe(false);
  });
});

describe("module gating", () => {
  const done = new Set<string>(["m1"]);

  it("hides an unpublished module entirely", () => {
    expect(moduleVisibility({ isPublished: false, prerequisiteModuleId: null }, done)).toBe("hidden");
  });

  it("opens a published module with no prerequisite", () => {
    expect(moduleVisibility({ isPublished: true, prerequisiteModuleId: null }, done)).toBe("open");
  });

  it("locks rather than hides a module whose prerequisite is unfinished", () => {
    // Visible-but-locked, so the path ahead is legible without being skippable.
    expect(moduleVisibility({ isPublished: true, prerequisiteModuleId: "m9" }, done)).toBe("locked");
  });

  it("opens once the prerequisite is complete", () => {
    expect(moduleVisibility({ isPublished: true, prerequisiteModuleId: "m1" }, done)).toBe("open");
  });

  it("keeps an unpublished module hidden even when its prerequisite is done", () => {
    expect(moduleVisibility({ isPublished: false, prerequisiteModuleId: "m1" }, done)).toBe("hidden");
  });
});
