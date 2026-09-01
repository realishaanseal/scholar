import { describe, it, expect } from "vitest";
import {
  can, authorize, explain, rolesIn, Forbidden,
  ROLE_PERMISSIONS, COURSE_BOUND, personalActor,
  type Actor, type Permission,
} from "@/lib/authz";

/*
  These tests are mostly about what must NOT be allowed. A permission system
  that grants correctly but fails open somewhere is worse than no system,
  because it reads as protection while providing none — so the cases below
  lean on cross-tenant leakage, unscoped calls, and roles reaching past the
  thing they are bound to.
*/

const ORG = "org-a";
const OTHER_ORG = "org-b";

function teacher(over: Partial<Actor> = {}): Actor {
  return {
    userId: "u-teacher",
    memberships: [{ organizationId: ORG, role: "TEACHER" }],
    teaching: [{ organizationId: ORG, courseId: "c-phys", courseSectionId: "s-phys-1" }],
    enrollments: [],
    ...over,
  };
}

function student(over: Partial<Actor> = {}): Actor {
  return {
    userId: "u-student",
    memberships: [{ organizationId: ORG, role: "STUDENT" }],
    teaching: [],
    enrollments: [{ organizationId: ORG, courseId: "c-phys", courseSectionId: "s-phys-1" }],
    ...over,
  };
}

describe("fail-closed defaults", () => {
  it("denies a check that names no organization", () => {
    // Guessing an organization would be the worst possible recovery here.
    expect(can(teacher(), "assignment:grade", {})).toBe(false);
    expect(explain(teacher(), "assignment:grade", {}).reason).toMatch(/no organization/i);
  });

  it("denies everything to a user with no institutional standing", () => {
    const independent = personalActor("u-solo");
    const everyPermission = new Set<Permission>(
      Object.values(ROLE_PERMISSIONS).flatMap((list) => [...list])
    );
    for (const permission of everyPermission) {
      expect(can(independent, permission, { organizationId: ORG })).toBe(false);
    }
  });

  it("denies a non-member of the organization in scope", () => {
    expect(can(teacher(), "course:view", { organizationId: OTHER_ORG, courseId: "c-phys" }))
      .toBe(false);
  });
});

describe("tenant isolation", () => {
  it("does not let a teaching assignment carry across organizations", () => {
    // Same section id, different organization. If the org were not compared,
    // an id collision across tenants would silently grant access.
    const crossTenant = teacher({
      memberships: [
        { organizationId: ORG, role: "TEACHER" },
        { organizationId: OTHER_ORG, role: "STUDENT" },
      ],
    });
    expect(
      can(crossTenant, "assignment:grade", {
        organizationId: OTHER_ORG,
        courseSectionId: "s-phys-1",
      })
    ).toBe(false);
  });

  it("keeps a person who is staff in one institution and a student in another separate", () => {
    const dual = teacher({
      memberships: [
        { organizationId: ORG, role: "TEACHER" },
        { organizationId: OTHER_ORG, role: "STUDENT" },
      ],
      enrollments: [{ organizationId: OTHER_ORG, courseId: "c-hist", courseSectionId: "s-hist-1" }],
    });
    // Teaches in A.
    expect(can(dual, "assignment:grade", { organizationId: ORG, courseSectionId: "s-phys-1" })).toBe(true);
    // Merely studies in B — grading there must be refused.
    expect(can(dual, "assignment:grade", { organizationId: OTHER_ORG, courseSectionId: "s-hist-1" })).toBe(false);
  });
});

describe("teacher binding", () => {
  it("grants grading in a section they teach", () => {
    expect(can(teacher(), "assignment:grade", { organizationId: ORG, courseSectionId: "s-phys-1" }))
      .toBe(true);
  });

  it("refuses grading in a section they do not teach", () => {
    // The whole point of scoped roles: TEACHER is not a global capability.
    expect(can(teacher(), "assignment:grade", { organizationId: ORG, courseSectionId: "s-chem-9" }))
      .toBe(false);
  });

  it("refuses a course-bound permission with nothing to bind to", () => {
    expect(can(teacher(), "assignment:grade", { organizationId: ORG })).toBe(false);
  });

  it("resolves at course level when no section is named", () => {
    expect(can(teacher(), "assignment:create", { organizationId: ORG, courseId: "c-phys" })).toBe(true);
    expect(can(teacher(), "assignment:create", { organizationId: ORG, courseId: "c-chem" })).toBe(false);
  });
});

describe("role differentiation", () => {
  const ta: Actor = {
    userId: "u-ta",
    memberships: [{ organizationId: ORG, role: "TEACHING_ASSISTANT" }],
    teaching: [{ organizationId: ORG, courseId: "c-phys", courseSectionId: "s-phys-1" }],
    enrollments: [],
  };
  const scope = { organizationId: ORG, courseSectionId: "s-phys-1" };

  it("lets an assistant mark work", () => {
    expect(can(ta, "assignment:grade", scope)).toBe(true);
    expect(can(ta, "grade:modify", scope)).toBe(true);
  });

  it("does not let an assistant publish grades or delete coursework", () => {
    // An assistant is not a teacher with a different label.
    expect(can(ta, "grade:publish", scope)).toBe(false);
    expect(can(ta, "assignment:delete", scope)).toBe(false);
    expect(can(ta, "course:update", scope)).toBe(false);
  });
});

describe("student binding", () => {
  it("grants access to their own enrolled section", () => {
    expect(can(student(), "submission:create", { organizationId: ORG, courseSectionId: "s-phys-1" }))
      .toBe(true);
  });

  it("refuses a section they are not enrolled in", () => {
    expect(can(student(), "assignment:view", { organizationId: ORG, courseSectionId: "s-chem-9" }))
      .toBe(false);
  });

  it("refuses another student's record even inside their own section", () => {
    expect(
      can(student(), "grade:view", {
        organizationId: ORG,
        courseSectionId: "s-phys-1",
        studentUserId: "u-someone-else",
      })
    ).toBe(false);
  });

  it("allows their own record when named explicitly", () => {
    expect(
      can(student(), "grade:view", {
        organizationId: ORG,
        courseSectionId: "s-phys-1",
        studentUserId: "u-student",
      })
    ).toBe(true);
  });

  it("never grants a student teaching capabilities", () => {
    const scope = { organizationId: ORG, courseSectionId: "s-phys-1" };
    expect(can(student(), "assignment:grade", scope)).toBe(false);
    expect(can(student(), "grade:modify", scope)).toBe(false);
    expect(can(student(), "attendance:manage", scope)).toBe(false);
  });
});

describe("guardian access", () => {
  const parent: Actor = {
    userId: "u-parent",
    memberships: [{ organizationId: ORG, role: "PARENT" }],
    teaching: [],
    enrollments: [],
    guardianOf: ["u-child"],
  };

  it("refuses a check that names no student", () => {
    // Guardian reach is defined by which child is named; an unnamed check
    // must not widen into organization-wide access.
    expect(can(parent, "grade:view", { organizationId: ORG })).toBe(false);
  });

  it("grants access to their own child", () => {
    expect(can(parent, "grade:view", { organizationId: ORG, studentUserId: "u-child" })).toBe(true);
  });

  it("refuses another family's child", () => {
    expect(can(parent, "grade:view", { organizationId: ORG, studentUserId: "u-other" })).toBe(false);
  });

  it("is read-only", () => {
    expect(can(parent, "grade:modify", { organizationId: ORG, studentUserId: "u-child" })).toBe(false);
    expect(can(parent, "assignment:create", { organizationId: ORG, studentUserId: "u-child" })).toBe(false);
  });
});

describe("department admin", () => {
  const deptAdmin: Actor = {
    userId: "u-dept",
    memberships: [{ organizationId: ORG, role: "DEPARTMENT_ADMIN", departmentId: "d-science" }],
    teaching: [],
    enrollments: [],
  };

  it("acts within its own department", () => {
    expect(can(deptAdmin, "course:create", { organizationId: ORG, departmentId: "d-science" }))
      .toBe(true);
  });

  it("refuses another department", () => {
    expect(can(deptAdmin, "course:create", { organizationId: ORG, departmentId: "d-arts" }))
      .toBe(false);
  });

  it("fails closed when the department is not stated", () => {
    // Resolving a course to its department needs a lookup the policy layer
    // does not do. Refusing is correct; inferring would be a guess.
    expect(can(deptAdmin, "course:update", { organizationId: ORG, courseId: "c-phys" })).toBe(false);
  });
});

describe("multiple roles", () => {
  it("takes the most permissive matching role, still scope-checked", () => {
    const both: Actor = {
      userId: "u-both",
      memberships: [
        { organizationId: ORG, role: "STUDENT" },
        { organizationId: ORG, role: "TEACHER" },
      ],
      teaching: [{ organizationId: ORG, courseId: "c-phys", courseSectionId: "s-phys-1" }],
      enrollments: [{ organizationId: ORG, courseId: "c-hist", courseSectionId: "s-hist-1" }],
    };
    // Teacher role reaches the section they teach.
    expect(can(both, "assignment:grade", { organizationId: ORG, courseSectionId: "s-phys-1" })).toBe(true);
    // But not the one where they are only a student.
    expect(can(both, "assignment:grade", { organizationId: ORG, courseSectionId: "s-hist-1" })).toBe(false);
  });
});

describe("super admin", () => {
  it("bypasses organization binding", () => {
    const su: Actor = { userId: "u-su", superAdmin: true, memberships: [], teaching: [], enrollments: [] };
    expect(can(su, "organization:manage", { organizationId: "any-org" })).toBe(true);
    expect(can(su, "grade:publish", {})).toBe(true);
  });
});

describe("authorize()", () => {
  it("throws Forbidden with the reason attached", () => {
    try {
      authorize(student(), "grade:modify", { organizationId: ORG, courseSectionId: "s-phys-1" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Forbidden);
      expect((err as Forbidden).permission).toBe("grade:modify");
      expect((err as Forbidden).why).toBeTruthy();
      // The client-facing message must not leak the internal reasoning.
      expect((err as Forbidden).message).not.toContain("role");
    }
  });

  it("returns silently when permitted", () => {
    expect(() =>
      authorize(teacher(), "assignment:grade", { organizationId: ORG, courseSectionId: "s-phys-1" })
    ).not.toThrow();
  });
});

describe("the personal layer is unreachable", () => {
  it("defines no permission over personal Scholar data", () => {
    // The guarantee is structural: no institutional role can reach a student's
    // tasks, sessions, notes or AI conversations because no grantable
    // permission for them exists. This test fails the build if one is added.
    const all = Object.values(ROLE_PERMISSIONS).flatMap((list) => [...list]);
    const personal = /(^|:)(task|study|session|note|journal|conversation|coach|personal)/i;
    expect(all.filter((p) => personal.test(p))).toEqual([]);
  });
});

describe("catalogue integrity", () => {
  it("only marks real permissions as course-bound", () => {
    const known = new Set(Object.values(ROLE_PERMISSIONS).flatMap((list) => [...list]));
    for (const p of COURSE_BOUND) {
      // course:delete is granted to no default role but is still a real,
      // bindable permission, so allow it through the check explicitly.
      if (p === "course:delete") continue;
      expect(known.has(p)).toBe(true);
    }
  });

  it("reports the roles a user holds in one organization only", () => {
    const dual = teacher({
      memberships: [
        { organizationId: ORG, role: "TEACHER" },
        { organizationId: OTHER_ORG, role: "INSTITUTION_ADMIN" },
      ],
    });
    expect(rolesIn(dual, ORG)).toEqual(["TEACHER"]);
    expect(rolesIn(dual, OTHER_ORG)).toEqual(["INSTITUTION_ADMIN"]);
  });
});
