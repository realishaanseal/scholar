import { estimateReceipts } from "@/domains/insight";

/**
 * What a student's own estimates have actually been worth.
 *
 * Scholar has been measuring this since long before there was an institution
 * in the picture, and using it to quietly correct the numbers it shows. That
 * is the wrong way round. Somebody who knows their physics estimates run
 * forty percent short can do something about it tonight; somebody whose
 * estimates are silently corrected for them learns nothing and never finds
 * out why the number moved.
 *
 * Shown as receipts rather than a score. "You said two hours, it took three
 * and a half" is a fact about an afternoon. "Estimation accuracy: 57%" is a
 * grade for something nobody was being graded on, and it would be the first
 * thing in Scholar that made a student feel measured.
 */
export default async function EstimateReceipts({ userId }: { userId: string }) {
  const { receipts, worst, overall } = await estimateReceipts(userId);
  if (receipts.length === 0) return null;

  const hours = (mins: number) => Math.round((mins / 60) * 10) / 10;
  const pct = (ratio: number) => Math.round(Math.abs(ratio - 1) * 100);

  return (
    <section className="card mb-6 rounded-xl px-4 py-4">
      <h2 className="text-[13.5px] font-medium text-slate-200">
        What your estimates have been worth
      </h2>

      {worst ? (
        <p className="mt-1 max-w-[58ch] text-[13px] leading-relaxed text-slate-300">
          {worst.ratio > 1 ? (
            <>
              <span className="text-slate-100">{worst.subject}</span> takes you about{" "}
              <span className="text-slate-100">{pct(worst.ratio)}% longer</span> than you
              expect — across {worst.occasions} finished pieces you said{" "}
              {hours(worst.estimatedMins)} hours and it took {hours(worst.actualMins)}.
              Scholar already allows for that when it plans your week.
            </>
          ) : (
            <>
              You finish <span className="text-slate-100">{worst.subject}</span> about{" "}
              <span className="text-slate-100">{pct(worst.ratio)}% faster</span> than you
              expect — {hours(worst.estimatedMins)} hours estimated,{" "}
              {hours(worst.actualMins)} actually spent, over {worst.occasions} pieces.
              You may have more room than you think.
            </>
          )}
        </p>
      ) : (
        <p className="mt-1 max-w-[58ch] text-[13px] leading-relaxed text-slate-400">
          Your estimates are close to what things actually take
          {overall !== null && ` — ${pct(overall)}% out overall`}. That is unusual, and it
          means the times Scholar shows you are close to your own.
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {receipts.map((r) => (
          <div key={r.subject} className="flex flex-wrap items-baseline gap-x-2.5 text-[12.5px]">
            <span className="w-[8rem] shrink-0 truncate text-slate-300">{r.subject}</span>
            <span className="tabular-nums text-slate-500">
              said {hours(r.estimatedMins)}h · took {hours(r.actualMins)}h
            </span>
            <span
              className={
                r.ratio > 1.1
                  ? "tabular-nums text-amber-300"
                  : r.ratio < 0.9
                    ? "tabular-nums text-sky-300"
                    : "tabular-nums text-slate-500"
              }
            >
              ×{r.ratio}
            </span>
            <span className="text-[11.5px] text-slate-600">
              over {r.occasions} {r.occasions === 1 ? "piece" : "pieces"}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
        Counted only from work you both estimated and finished. Nobody else is shown this.
      </p>
    </section>
  );
}
