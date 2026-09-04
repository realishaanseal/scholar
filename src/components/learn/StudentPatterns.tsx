import Link from "next/link";
import { criterionPatterns, whatYouMissed, MIN_OCCASIONS } from "@/domains/insight";
import { formatDate } from "@/lib/i18n/format";

/**
 * Two things Scholar can tell a student that nothing else can.
 *
 * Both are joins no other system has available: rubric marks stored per
 * criterion across every course, and attendance sitting in the same database
 * as coursework.
 *
 * Both are a student's own records told back to the student. Neither is a
 * prediction, and neither is offered to anybody else — the difference between
 * "you lost most marks on structure across six essays", which is a fact about
 * six essays, and "this student is at risk", which is a claim about a child.
 */
export default async function StudentPatterns({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [insight, missed] = await Promise.all([
    criterionPatterns(userId, organizationId),
    whatYouMissed(userId, organizationId),
  ]);

  const hasPatterns = insight.patterns.some((p) => p.occasions >= MIN_OCCASIONS);
  if (!hasPatterns && missed.length === 0) return null;

  return (
    <div className="space-y-4">
      {hasPatterns && (
        <section className="card rounded-xl px-4 py-4">
          <h2 className="text-[13.5px] font-medium text-slate-200">
            Where your marks go
          </h2>

          {insight.weakest ? (
            <p className="mt-1 max-w-[56ch] text-[13px] leading-relaxed text-slate-300">
              Across{" "}
              <span className="text-slate-100">
                {insight.weakest.occasions} marked pieces of work
              </span>
              , <span className="text-slate-100">{insight.weakest.title}</span> is where
              you lose most — {insight.weakest.percentage}% of the marks available,
              against {insight.averageElsewhere}% on everything else
              {insight.weakest.courses.length > 1 &&
                `, in ${insight.weakest.courses.join(" and ")}`}
              .
            </p>
          ) : (
            <p className="mt-1 max-w-[56ch] text-[13px] leading-relaxed text-slate-400">
              Your marks are fairly even across the things you are assessed on — no one
              area is dragging.
            </p>
          )}

          <div className="mt-3 space-y-1.5">
            {insight.patterns
              .filter((p) => p.occasions >= MIN_OCCASIONS)
              .map((p) => (
                <div key={p.criterionId} className="flex items-center gap-3">
                  <span className="w-[9rem] shrink-0 truncate text-[12.5px] text-slate-300">
                    {p.title}
                  </span>
                  {/* A bar rather than a number alone: the comparison between
                      rows is the whole point, and eyes do that faster. */}
                  <span
                    className="h-1.5 min-w-[2px] rounded-full bg-vx-400/70"
                    style={{ width: `${Math.max(2, Math.min(100, p.percentage))}%` }}
                    aria-hidden
                  />
                  <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
                    {p.percentage}%
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {missed.length > 0 && (
        <section className="card rounded-xl px-4 py-4">
          <h2 className="text-[13.5px] font-medium text-slate-200">While you were away</h2>
          <p className="mt-1 max-w-[56ch] text-[13px] leading-relaxed text-slate-400">
            Work set and material published on days you were not in.
          </p>

          <div className="mt-3 space-y-3">
            {missed.map((d) => (
              <div key={`${d.date}-${d.sectionId}`}>
                <p className="text-[12.5px] text-slate-300">
                  <span className="font-mono text-[12px] text-slate-400">{d.courseCode}</span>
                  {" · "}
                  {formatDate(d.date, "en", "weekdayDate")}
                  {d.state === "excused" && (
                    <span className="ms-1.5 text-[11.5px] text-slate-500">authorised</span>
                  )}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {d.assignments.map((a) => (
                    <li key={a.id} className="text-[12.5px] text-slate-400">
                      Work set: <span className="text-slate-300">{a.title}</span>
                      {a.dueAt && ` · due ${formatDate(a.dueAt, "en", "monthDay")}`}
                    </li>
                  ))}
                  {d.materials.map((m) => (
                    <li key={m.id} className="text-[12.5px] text-slate-400">
                      {m.kind}: <span className="text-slate-300">{m.title}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/learn/${d.sectionId}`}
                  className="mt-1 inline-block text-[12px] text-vx-300 hover:text-vx-200"
                >
                  Open the course
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
