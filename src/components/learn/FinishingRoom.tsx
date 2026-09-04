import { finishedWithDeadlines } from "@/domains/insight";
import { finishingMargins } from "@/domains/insight/margin";

/**
 * How much room this student has left themselves, and what it cost.
 *
 * Sits beside the estimate receipts on Insights. Both are measurements of
 * their own working returned to them; neither is a score and neither mentions
 * a grade.
 *
 * Silent unless two bands have enough behind them and differ by enough to be
 * worth a sentence. A module that produces a chart from four data points is
 * how a measurement becomes a horoscope.
 */
export default async function FinishingRoom({ userId }: { userId: string }) {
  const { bands, gap } = finishingMargins(await finishedWithDeadlines(userId));
  if (bands.length === 0) return null;

  const pct = (r: number) => Math.round(r * 100);
  const widest = Math.max(...bands.map((b) => b.ratio), 1);

  return (
    <section className="card mb-6 rounded-xl px-4 py-4">
      <h2 className="text-[13.5px] font-medium text-slate-200">How much room you leave</h2>

      {gap !== null ? (
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-slate-300">
          Work you {bands[0].label.toLowerCase().replace("finished ", "finished ")} ran{" "}
          <span className="text-slate-100">{pct(bands[0].ratio)}%</span> of your estimate.
          Work you {bands[bands.length - 1].label.toLowerCase().replace("finished ", "finished ")}{" "}
          ran <span className={gap > 0 ? "text-amber-300" : "text-slate-100"}>
            {pct(bands[bands.length - 1].ratio)}%
          </span>.
        </p>
      ) : (
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-slate-400">
          Your estimates hold up about the same however much room you leave.
        </p>
      )}

      <ul className="mt-3 space-y-2.5">
        {bands.map((b) => (
          <li key={b.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
              <span className="text-slate-300">{b.label}</span>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-slate-400">
                {pct(b.ratio)}% of estimate · {b.pieces}{" "}
                {b.pieces === 1 ? "piece" : "pieces"}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={b.ratio > 1.25 ? "h-full rounded-full bg-amber-400/70" : "h-full rounded-full bg-vx-500/60"}
                style={{ width: `${Math.max(3, (b.ratio / widest) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Drawn from work you both estimated and timed. Scholar does not record when you
        started something, so this is about when you finished.
      </p>
    </section>
  );
}
