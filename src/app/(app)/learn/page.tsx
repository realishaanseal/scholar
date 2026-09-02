import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { listEnrolledCourses } from "@/domains/learning";

export const dynamic = "force-dynamic";

/**
 * The student's courses.
 *
 * No permission check needed to build the list: the query joins through this
 * viewer's own enrolments, so it cannot return a course they are not in.
 */
export default async function LearnPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const courses = await listEnrolledCourses(session.user.id);
  const owed = courses.reduce((n, c) => n + c.outstanding, 0);

  return (
    <div>
      <PageHeading
        title="Courses"
        subtitle={
          courses.length === 0
            ? "You are not enrolled in anything yet."
            : owed === 0
              ? "Nothing outstanding — you are up to date."
              : `${owed} piece${owed === 1 ? "" : "s"} of work outstanding.`
        }
      />

      {courses.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">No courses yet</p>
          <p className="mt-1.5 max-w-[50ch] text-[13px] leading-relaxed text-slate-400">
            When your school adds you to a class it appears here, and the work your
            teachers set turns up on your homework list automatically — with their
            deadline and your own plan around it.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {courses.map((c, i) => (
            <Reveal key={c.sectionId} y={10} delay={Math.min(i * 0.04, 0.2)}>
              <Link
                href={`/learn/${c.sectionId}`}
                className="card card-hover flex items-center gap-4 rounded-xl px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-slate-100">
                    {c.courseCode} — {c.courseTitle}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500">
                    {c.sectionName} · {c.termName}
                    {c.materialCount > 0 && ` · ${c.materialCount} in the library`}
                  </p>
                </div>

                {/* Only what is owed gets emphasis; a total is trivia. */}
                {c.outstanding > 0 ? (
                  <span className="shrink-0 rounded-full bg-[hsl(var(--accent-h)_var(--accent-s)_var(--accent-l))]/[0.15] px-2.5 py-1 text-[11.5px] font-medium text-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_+_14%))]">
                    {c.outstanding} to do
                  </span>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-slate-500">Up to date</span>
                )}
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
