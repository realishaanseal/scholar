import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CourseWork from "@/components/learn/CourseWork";
import BeforeYouSubmit from "@/components/learn/BeforeYouSubmit";
import SectionTabs from "@/components/teach/SectionTabs";
import Announcements from "@/components/teach/Announcements";
import StudentMaterials from "@/components/learn/StudentMaterials";
import { auth } from "@/lib/auth";
import { getSectionDetail } from "@/domains/courses";
import { isEnrolledIn, listStudentAssignments } from "@/domains/learning";
import { listMaterials } from "@/domains/library";
import { describeGrade, studentGrade } from "@/domains/grading";
import { displayGrade, scheme } from "@/domains/grading/schemes";
import { getOrganizationTime } from "@/domains/identity";
import { planCoursework } from "@/domains/insight";

export const dynamic = "force-dynamic";

/**
 * One course, from the student's side.
 *
 * Enrolment is checked explicitly rather than inferred: this page reads
 * published coursework and a library, and someone who guessed a section id
 * should get the same nothing as someone who guessed a random string.
 */
export default async function LearnSectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await isEnrolledIn(session.user.id, sectionId))) notFound();

  const section = await getSectionDetail(sectionId);
  if (!section) notFound();

  const [assignments, materials, grade, orgTime, plans] = await Promise.all([
    listStudentAssignments(sectionId, session.user.id),
    // Published only. A draft is the teacher still preparing.
    listMaterials(section.courseId, { publishedOnly: true }),
    studentGrade(sectionId, section.courseId, session.user.id),
    getOrganizationTime(section.organizationId),
    // The half a course cannot work out on its own: how long this will take
    // THIS student, and how late they can leave it.
    planCoursework(session.user.id, sectionId),
  ]);

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/learn"
          className="text-[12.5px] text-slate-500 transition-colors hover:text-slate-300"
        >
          ← Your courses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          <span className="gradient-text">
            {section.courseCode} — {section.courseTitle}
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          {section.name} · {section.termName}
        </p>
      </div>

      {/* Their standing, stated with its own caveats rather than as a bare
          number: a percentage over half-marked work is not a final grade, and
          saying which is which is the difference between informing someone and
          worrying them. */}
      {grade.percentage !== null && (
        <div className="card mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-4 py-3.5">
          <span className="text-2xl font-semibold tabular-nums text-slate-100">
            {displayGrade(grade.percentage, scheme(orgTime.gradingScheme))?.text}
          </span>
          <span className="text-[12.5px] text-slate-500">{describeGrade(grade)}</span>
          {grade.awaiting > 0 && (
            <span className="text-[12.5px] text-slate-500">
              · {grade.awaiting} still to be marked
            </span>
          )}
          {grade.missing > 0 && (
            <span className="text-[12.5px] text-rose-300/80">
              · {grade.missing} not handed in
            </span>
          )}
        </div>
      )}

      <SectionTabs
        counts={{ work: assignments.length, materials: materials.length, students: 0 }}
        labels={{ work: "Work", materials: "Library" }}
        work={
          <>
            {/* The soonest thing still to hand in that will be marked against
                a rubric. One prompt for the piece in front of them, rather
                than a note on every row of a list they are scrolling past. */}
            <BeforeYouSubmit
              userId={session.user.id}
              organizationId={section.organizationId}
              rubricId={
                assignments
                  .filter((a) => a.rubricId && a.submission?.status !== "returned")
                  .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))[0]
                  ?.rubricId ?? null
              }
            />
            <CourseWork assignments={assignments} plans={plans} timezone={section.timezone} />
          </>
        }
        materials={
          <StudentMaterials
            materials={materials.map((m) => ({
              ...m,
              downloadUrl: m.fileId ? `/api/institution/files/${m.fileId}` : null,
            }))}
          />
        }
        notices={<Announcements sectionId={sectionId} />}
      />
    </div>
  );
}
