import Link from "next/link";
import { planWeek } from "@/domains/insight";

/**
 * The week, in hours and in order.
 *
 * Ordered by slack, not by deadline — see orderOfWork. Each row carries its
 * own reason, which is the only explanation this component renders: advice a
 * student cannot check is advice they follow blindly or ignore.
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
      <h2 className="text-[13.5px] font-medium text-slate-200">Your week</h2>

      <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-slate-300">
        {tight ? (
          <>
            You have <span className="text-slate-100">{hours(budget.workMins)} hours</span> of
            work and <span className="text-amber-300">{hours(budget.availableMins)} hours</span>{" "}
            to do it in — about {hours(-budget.slackMins)} hours short.
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
          estimate, so this is a floor.
        </p>
      )}

      {order.length > 0 && (
        <>
          <p className="mt-3.5 text-[11.5px] uppercase tracking-wide text-slate-500">
            Order to work in
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
        </>
      )}
    </section>
  );
}
