import { NextResponse } from "next/server";
import { z } from "zod";
import { BadRequest, institutionalRoute, readBody } from "@/lib/api/guard";
import {
  administeredOrganizations, createAcademicYear, createTerm,
  getCurrentAcademicYear, listTerms,
} from "@/domains/identity";
import { createCourse, createSection } from "@/domains/courses";
import { audit } from "@/lib/governance";
import { Forbidden } from "@/lib/authz";
import type { Scope } from "@/lib/authz";

export const runtime = "nodejs";

type Params = Record<string, never>;

async function scopeOfAdministeredOrg({ userId }: { userId: string }): Promise<Scope> {
  const org = (await administeredOrganizations(userId))[0];
  if (!org) throw new Forbidden("organization:manage", {}, "administers no organization");
  return { organizationId: org.id };
}

const courseSchema = z.object({
  code: z.string().trim().min(1, "Give the course a code.").max(32),
  title: z.string().trim().min(2, "Give the course a title.").max(200),
  sectionName: z.string().trim().min(1).max(80).default("Section 1"),
});

/**
 * Create a course and its first section.
 *
 * One action rather than two, because a course with no section cannot be
 * taught, enrolled into or assigned work — it is a row that looks like
 * progress and does nothing. An administrator who wants more sections adds
 * them afterwards; an administrator who wants one should not have to know
 * that a section is a separate concept.
 *
 * The term is resolved or created rather than asked for. Nobody setting up
 * their first course wants to be stopped and asked to define an academic year
 * before they can name a class, and a term that turns out to be wrong is a
 * far cheaper mistake to fix than an abandoned setup.
 */
export const POST = institutionalRoute<Params, Scope>(
  { permission: "organization:manage", scope: scopeOfAdministeredOrg },
  async ({ req, userId, scope }) => {
    const input = await readBody(req, courseSchema);
    const organizationId = scope.organizationId!;

    let year = await getCurrentAcademicYear(organizationId);
    if (!year) {
      const now = new Date();
      // A year running from today, named for the calendar years it spans.
      // Northern and southern hemispheres disagree about when a year starts,
      // so "now until a year from now" is the assumption that is wrong by the
      // least everywhere rather than right in one place.
      const end = new Date(now);
      end.setFullYear(end.getFullYear() + 1);
      year = await createAcademicYear(organizationId, {
        name: `${now.getFullYear()}–${end.getFullYear()}`,
        startsOn: now.toISOString().slice(0, 10),
        endsOn: end.toISOString().slice(0, 10),
        isCurrent: true,
      });
    }

    const terms = await listTerms(year.id);
    const term =
      terms[0] ??
      (await createTerm(organizationId, {
        academicYearId: year.id,
        name: "Term 1",
        startsOn: year.startsOn,
        endsOn: year.endsOn,
      }));

    const course = await createCourse(organizationId, {
      code: input.code,
      title: input.title,
      description: "",
      departmentId: null,
      credits: null,
    });

    const section = await createSection(organizationId, {
      courseId: course.id,
      termId: term.id,
      name: input.sectionName,
      // Uncapped: a school that needs a limit sets one, and guessing a number
      // here would silently refuse the thirty-first student.
      capacity: null,
    });

    await audit({
      organizationId,
      actorUserId: userId,
      action: "assignment:publish",
      subjectType: "course",
      subjectId: course.id,
      detail: { code: course.code, section: section.name },
    });

    return NextResponse.json({ course, section }, { status: 201 });
  }
);
