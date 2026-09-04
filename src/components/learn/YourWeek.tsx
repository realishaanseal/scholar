import Link from "next/link";
import { planWeek } from "@/domains/insight";

/**
 * The week, in hours and in order.
 *
 * Two things every other LMS leaves a student to work out alone: how much
 * time actually exists before the next deadline, and which of four things to
 * start tonight.
 *
 * The order is not by deadline. Sorting by deadline is what a student does on
 * their own and it is what gets them into trouble — a four-hour essay due
 * Friday needs starting before a twenty-minute worksheet due Wednesday. Every
 * row says why it sits where it does, because advice a student cannot argue
 * with is advice they will either follow blindly or ignore entirely, and both
 * are worse than advice they can check.
 */
export default async function YourWeek({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const { budget, order } = await planWeek(userId, organizationId);
  if (order.length === 0 && budget.unestimated === 0) return null;

  const hours = (mins: number) => {
    const h = mins / 60;
    return h >= 10 ? Math.round(h) : Math.round(h * 10) / 10;
  };

  const tight = budget.slackMins < 0;

  return (
    <section className="card mb-5 rounded-xl px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-medium text-slate-200">Your week</h2>
        <span className="text-[12px] text-slate-500">
          in study hours, not days
        </span>
      </div>

      {/* The headline sentence. Hours rather than "due in 3 days", because
          three days is not a quantity of anything anybody can spend. */}
      <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-slate-300">
        {tight ? (
          <>
            You have <span className="text-slate-100">{hours(budget.workMins)} hours</span> of
            work and <span className="text-amber-300">{hours(budget.availableMins)} hours</span>{" "}
            to do it in — about {hours(-budget.slackMins)} hours short. Worth telling a
            teacher now, while there is still time to do something about it.
          </>
        ) : (
          <>
            You have <span className="text-slate-100">{hours(budget.workMins)} hours</span> of
            work and <span className="text-slate-100">{hours(budget.availableMins)} hours</span>{" "}
            of study time before the last of it is due.
            {budget.workDueNext > 0 && (
              <>
                {" "}
                Before your next deadline: {hours(budget.workDueNext)} hours of it, with{" "}
                {hours(budget.availableBeforeNext)} hours available.
              </>
            )}
          </>
        )}
      </p>

      {budget.unestimated > 0 && (
        <p className="mt-1 text-[11.5px] text-slate-600">
          {budget.unestimated} {budget.unestimated === 1 ? "piece has" : "pieces have"} no
          time estimate, so the total is a floor rather than a figure.
        </p>
      )}

      {order.length > 0 && (
        <>
          <p className="mt-3.5 text-[11.5px] uppercase tracking-wide text-slate-500">
            The order worth doing them in
          </p>
          <ol className="mt-1.5 space-y-2">
            {order.map((o, i) => (
              <li key={o.id} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] tabular-nums text-slate-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <Link
                      href={`/learn/${o.sectionId}`}
                      className="text-slate-100 hover:text-vx-200"
                    >
                      {o.title}
                    </Link>
                    <span className="font-mono text-[11.5px] text-slate-500">
                      {o.courseCode}
                    </span>
                    {o.estimateMins !== null && (
                      <span className="text-[11.5px] text-slate-500">
                        ~{hours(o.estimateMins)}h
                      </span>
                    )}
                  </p>
                  {/* The workings. A student who disagrees can see exactly
                      what Scholar counted. */}
                  <p
                    className={
                      o.atRisk
                        ? "text-[12px] leading-relaxed text-rose-300"
                        : "text-[12px] leading-relaxed text-slate-500"
                    }
                  >
                    {o.reason}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
            Not ordered by deadline. A long piece due later often needs starting before a
            short one due sooner, which is the thing deadline order gets wrong.
          </p>
        </>
      )}
    </section>
  );
}
