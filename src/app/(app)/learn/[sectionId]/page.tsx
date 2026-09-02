import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CourseWork from "@/components/learn/CourseWork";
import SectionTabs from "@/components/teach/SectionTabs";
import StudentMaterials from "@/components/learn/StudentMaterials";
import { auth } from "@/lib/auth";
import { getSectionDetail } from "@/domains/courses";
import { isEnrolledIn, listStudentAssignments } from "@/domains/learning";
import { listMaterials } from "@/domains/library";

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

  const [assignments, materials] = await Promise.all([
    listStudentAssignments(sectionId, session.user.id),
    // Published only. A draft is the teacher still preparing.
    listMaterials(section.courseId, { publishedOnly: true }),
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

      <SectionTabs
        counts={{ work: assignments.length, materials: materials.length, students: 0 }}
        labels={{ work: "Work", materials: "Library" }}
        work={<CourseWork assignments={assignments} />}
        materials={
          <StudentMaterials
            materials={materials.map((m) => ({
              ...m,
              downloadUrl: m.fileId ? `/api/institution/files/${m.fileId}` : null,
            }))}
          />
        }
      />
    </div>
  );
}
