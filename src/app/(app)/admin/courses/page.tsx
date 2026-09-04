import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { administeredOrganizations } from "@/domains/identity";
import { listCourses, listSections } from "@/domains/courses";
import CourseCreator from "@/components/admin/CourseCreator";

export const dynamic = "force-dynamic";

export default async function AdminCoursesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = (await administeredOrganizations(session.user.id))[0]!;
  const courses = await listCourses(org.id);
  const sections = await Promise.all(courses.map((c) => listSections(c.id)));

  return (
    <div>
      <PageHeading
        title="Courses"
        subtitle={`${courses.length} ${courses.length === 1 ? "course" : "courses"} in ${org.name}.`}
      />

      <CourseCreator hasCourses={courses.length > 0} />

      {courses.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">No courses yet</p>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate-400">
            Create one above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map((c, i) => (
            <Reveal key={c.id} y={6} delay={Math.min(i * 0.03, 0.18)}>
              <div className="card rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-slate-100">
                      {c.code} — {c.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">
                      {sections[i].length} section{sections[i].length === 1 ? "" : "s"}
                      {c.credits !== null && ` · ${c.credits} credits`}
                    </p>
                  </div>
                  {/* Draft is the state that matters here: a course students
                      cannot see is usually a mistake rather than a plan. */}
                  <span
                    className={
                      c.status === "published"
                        ? "shrink-0 rounded-full bg-emerald-400/[0.12] px-2 py-0.5 text-[11px] text-emerald-300"
                        : "shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400"
                    }
                  >
                    {c.status}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
