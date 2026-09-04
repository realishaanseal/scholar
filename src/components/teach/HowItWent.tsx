import {
  criterionOutcomes, markingDrift, MIN_MARKED, MIN_SITTINGS,
} from "@/domains/insight/teaching";

/**
 * After the marking: what the class found hard, and how the marking ran.
 *
 * Shown on an assignment once there is enough of it to mean anything. Both
 * halves are drawn from rubric marks the teacher recorded themselves, which is
 * why this can exist at all — no other view of a class is available to Scholar
 * without reading things a teacher has no business seeing.
 */
export default async function HowItWent({
  assignmentId,
  organizationId,
}: {
  assignmentId: string;
  organizationId: string;
}) {
  const [criteria, drift] = await Promise.all([
    criterionOutcomes(assignmentId, organizationId),
    markingDrift(assignmentId, organizationId),
  ]);

  const usable = criteria.filter((c) => c.marked >= MIN_MARKED);
  if (usable.length === 0 && drift.spreadPoints === null) return null;

  const pct = (n: number) => Math.round(n * 100);

  return (
    <section className="card mt-5 rounded-xl px-4 py-4">
      <h2 className="text-[13.5px] font-medium text-slate-200">How it went</h2>

      {usable.length > 0 && (
        <>
          <p className="mt-1 text-[12px] text-slate-500">
            Mean score per criterion across {usable[0].marked} marked{" "}
            {usable[0].marked === 1 ? "submission" : "submissions"}.
          </p>
          <ul className="mt-3 space-y-2.5">
            {usable.map((c, i) => (
              <li key={c.criterionId}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className={i === 0 ? "text-slate-100" : "text-slate-300"}>
                    {c.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-slate-400">
                    {pct(c.share)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={
                      i === 0 ? "h-full rounded-full bg-amber-400/80" : "h-full rounded-full bg-vx-500/70"
                    }
                    style={{ width: `${Math.max(2, pct(c.share))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {usable.length > 1 && (
            <p className="mt-3 max-w-[62ch] text-[12px] leading-relaxed text-slate-400">
              <span className="text-slate-200">{usable[0].title}</span> scored lowest, at{" "}
              {pct(usable[0].share)}% against {pct(usable[usable.length - 1].share)}% for{" "}
              {usable[usable.length - 1].title}.
            </p>
          )}
        </>
      )}

      {drift.spreadPoints !== null && (
        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3.5 py-3">
          <p className="text-[11.5px] uppercase tracking-wide text-amber-300/80">
            Across {drift.days.length} marking {drift.days.length === 1 ? "day" : "days"}
          </p>
          <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-slate-300">
            Work marked on {drift.days[0].day} scored{" "}
            <span className="text-slate-100">
              {Math.abs(drift.spreadPoints)} points {drift.spreadPoints > 0 ? "higher" : "lower"}
            </span>{" "}
            on average than work marked on {drift.days[drift.days.length - 1].day}.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">
            This could be the scripts rather than the marking. Scholar cannot tell which,
            and nothing has been adjusted. Only you see this.
          </p>
        </div>
      )}

      {usable.length === 0 && (
        <p className="mt-2 text-[12px] text-slate-500">
          Per-criterion figures appear once {MIN_MARKED} submissions have been marked
          against the rubric.
        </p>
      )}

      {drift.spreadPoints === null && drift.days.length >= MIN_SITTINGS && (
        <p className="mt-3 text-[11.5px] text-slate-500">
          Marks were consistent across the {drift.days.length} days you marked over.
        </p>
      )}
    </section>
  );
}
