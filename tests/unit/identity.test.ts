import { describe, it, expect } from "vitest";
import { toActor, createOrganizationSchema, academicYearSchema, addMemberSchema } from "@/domains/identity";
import { can } from "@/lib/authz";

/*
  The row-to-Actor mapping is where a database record becomes authority, so
  it is tested as security code rather than as plumbing: a suspended member or
  an unrecognised role slipping through here would be granted access by every
  check downstream.
*/

const ORG = "org-a";

const row = (over: Partial<{
  organization_id: string; role: string; department_id: string | null; status: string;
}> = {}) => ({
  organization_id: ORG,
  role: "TEACHER",
  department_id: null,
  status: "active",
  ...over,
});

describe("toActor", () => {
  it("maps an active membership", () => {
    const actor = toActor("u1", { memberships: [row()] });
    expect(actor.userId).toBe("u1");
    expect(actor.memberships).toEqual([{ organizationId: ORG, role: "TEACHER" }]);
  });

  it("drops memberships that are not active", () => {
    // The row existing is not the same as the person having access. An invited
    // or suspended member must carry no authority at all.
    for (const status of ["invited", "suspended", "removed"]) {
      const actor = toActor("u1", { memberships: [row({ status })] });
      expect(actor.memberships).toEqual([]);
      expect(can(actor, "course:view", { organizationId: ORG, courseId: "c1" })).toBe(false);
    }
  });

  it("drops roles this build does not recognise", () => {
    // The role column has no CHECK constraint, so custom institution roles can
    // land here before the code knows about them. Dropping is explicit; the
    // alternative is relying on the policy engine's default branch by accident.
    const actor = toActor("u1", { memberships: [row({ role: "PRINCIPAL_OVERLORD" })] });
    expect(actor.memberships).toEqual([]);
  });

  it("keeps a department when the role is department-scoped", () => {
    const actor = toActor("u1", {
      memberships: [row({ role: "DEPARTMENT_ADMIN", department_id: "d1" })],
    });
    expect(actor.memberships[0]).toEqual({
      organizationId: ORG, role: "DEPARTMENT_ADMIN", departmentId: "d1",
    });
    expect(can(actor, "course:create", { organizationId: ORG, departmentId: "d1" })).toBe(true);
    expect(can(actor, "course:create", { organizationId: ORG, departmentId: "d2" })).toBe(false);
  });

  it("resolves an actor with no institutional rows to no authority", () => {
    const actor = toActor("u1", { memberships: [] });
    expect(actor.memberships).toEqual([]);
    expect(actor.teaching).toEqual([]);
    expect(actor.enrollments).toEqual([]);
  });

  it("fails closed on course-bound permissions while there are no course tables", () => {
    // Teaching assignments arrive with the course infrastructure. Until then a
    // teacher has a role but reaches no section, and grading must be refused.
    const actor = toActor("u1", { memberships: [row({ role: "TEACHER" })] });
    expect(can(actor, "assignment:grade", { organizationId: ORG, courseSectionId: "s1" })).toBe(false);
    // Non-course-bound capability still works, so the role is not inert.
    expect(can(actor, "analytics:view", { organizationId: ORG })).toBe(true);
  });

  it("does not mark an ordinary user as a super admin", () => {
    expect(toActor("u1", { memberships: [row()] }).superAdmin).toBe(false);
  });
});

describe("organization input", () => {
  it("accepts a well-formed institution", () => {
    const parsed = createOrganizationSchema.parse({
      name: "  Springfield University ",
      slug: "Springfield-U",
      timezone: "Asia/Kolkata",
    });
    expect(parsed.name).toBe("Springfield University");
    expect(parsed.slug).toBe("springfield-u");
    expect(parsed.locale).toBe("en");
  });

  it("rejects slugs that would break a URL", () => {
    for (const slug of ["has space", "Trailing-", "-leading", "double--hyphen", "a", "sym@bol"]) {
      expect(createOrganizationSchema.safeParse({ name: "Valid Name", slug }).success).toBe(false);
    }
  });

  it("rejects a timezone the runtime does not know", () => {
    const bad = createOrganizationSchema.safeParse({
      name: "Valid Name", slug: "valid", timezone: "Mars/Olympus_Mons",
    });
    expect(bad.success).toBe(false);
  });

  it("defaults to UTC rather than the server's local zone", () => {
    // Inheriting the server's zone would make the same input mean different
    // things depending on where it was deployed.
    expect(createOrganizationSchema.parse({ name: "Valid Name", slug: "valid" }).timezone).toBe("UTC");
  });
});

describe("academic year input", () => {
  it("requires the year to end after it starts", () => {
    const backwards = academicYearSchema.safeParse({
      name: "2026-27", startsOn: "2027-06-01", endsOn: "2026-06-01",
    });
    expect(backwards.success).toBe(false);
  });

  it("requires calendar dates, not timestamps", () => {
    const withTime = academicYearSchema.safeParse({
      name: "2026-27", startsOn: "2026-06-01T00:00:00Z", endsOn: "2027-05-31",
    });
    expect(withTime.success).toBe(false);
  });

  it("accepts a valid year and defaults it to not current", () => {
    const parsed = academicYearSchema.parse({
      name: "2026-27", startsOn: "2026-06-01", endsOn: "2027-05-31",
    });
    expect(parsed.isCurrent).toBe(false);
  });
});

describe("member input", () => {
  it("only accepts known roles", () => {
    expect(addMemberSchema.safeParse({ userId: "u1", role: "TEACHER" }).success).toBe(true);
    expect(addMemberSchema.safeParse({ userId: "u1", role: "OVERLORD" }).success).toBe(false);
  });

  it("treats department as optional", () => {
    expect(addMemberSchema.parse({ userId: "u1", role: "STUDENT" }).departmentId).toBeNull();
  });
});
