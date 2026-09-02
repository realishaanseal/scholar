import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { listSectionsForTeacher } from "@/domains/courses";

export const dynamic = "force-dynamic";

/**
 * The teacher's landing page.
 *
 * No permission check is needed to *list* — the query is keyed on the viewer's
 * own teaching assignments, so it can only ever return their own sections.
 * Authorization that would add nothing is worse than none: it implies a check
 * is happening that is not the one protecting the data.
 */
export default async function TeachPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sections = await listSectionsForTeacher(session.user.id);

  return (
    <div>
      <PageHeading
        title="Teaching"
        subtitle="Your sections, and what is waiting on you in each."
      />

      {sections.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">
            You are not teaching any sections
          </p>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-slate-400">
            Teaching appears here once an institution adds you to a course section.
            Your own homework, timetable and planning are unaffected either way —
            they stay yours.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sections.map((s, i) => (
            <Reveal key={s.id} y={10} delay={Math.min(i * 0.04, 0.2)}>
              <Link
                href={`/teach/${s.id}`}
                className="card card-hover flex items-center gap-4 rounded-xl px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-slate-100">
                    {s.courseCode} · {s.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500">
                    {s.courseTitle} — {s.termName} · {s.organizationName}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-right">
                  <Stat value={s.enrolledCount} label="students" />
                  <Stat value={s.openAssignments} label="published" />
                  {/* The only number that is a call to action, so it is the
                      only one that gets colour. */}
                  <Stat
                    value={s.ungradedSubmissions}
                    label="to mark"
                    accent={s.ungradedSubmissions > 0}
                  />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  value, label, accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="w-[62px]">
      <p
        className={
          accent
            ? "text-[15px] font-semibold tabular-nums text-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_+_10%))]"
            : "text-[15px] font-semibold tabular-nums text-slate-300"
        }
      >
        {value}
      </p>
      <p className="text-[10.5px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
