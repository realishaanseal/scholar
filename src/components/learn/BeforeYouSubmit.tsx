import { criterionPatterns, MIN_OCCASIONS } from "@/domains/insight/student";
import { getRubric } from "@/domains/assessment";

/**
 * The criteria this student loses marks on, shown against the rubric they are
 * about to be marked against.
 *
 * criterionPatterns already knows that somebody consistently drops marks on
 * Structure across English and History. Showing it on the insights page is a
 * fact about last term. Showing it here, beside the rubric for the piece in
 * front of them, is the same fact at the only moment it can change anything.
 *
 * Matched on the criterion title, lowercased and trimmed, which is how the
 * cross-course pattern is built in the first place. Two departments writing
 * "Use of evidence" mean the same thing, and a system that treated them as
 * unrelated because they have different ids would have nothing to say.
 *
 * Only ever the student's own marks, shown to that student. No teacher and no
 * administrator has a screen built on this, and nothing here is scored.
 */

/** Below this share of the available marks a criterion is worth mentioning. */
const WEAK_BELOW = 75;

export default async function BeforeYouSubmit({
  userId,
  organizationId,
  rubricId,
}: {
  userId: string;
  organizationId: string;
  /** The rubric this piece will be marked against. Null when there is none. */
  rubricId: string | null;
}) {
  if (!rubricId) return null;

  const [insight, rubric] = await Promise.all([
    criterionPatterns(userId, organizationId),
    getRubric(rubricId),
  ]);

  if (!rubric || rubric.criteria.length === 0) return null;

  const key = (s: string) => s.toLowerCase().trim();
  const history = new Map(
    insight.patterns
      .filter((p) => p.occasions >= MIN_OCCASIONS && p.percentage < WEAK_BELOW)
      .map((p) => [key(p.title), p])
  );

  const flagged = rubric.criteria
    .map((c) => ({ criterion: c, past: history.get(key(c.title)) }))
    .filter((m) => m.past !== undefined)
    .sort((a, b) => a.past!.percentage - b.past!.percentage);

  if (flagged.length === 0) return null;

  return (
    <section className="card mb-4 rounded-xl border-vx-500/25 bg-vx-500/[0.04] px-4 py-3.5">
      <h3 className="text-[12.5px] font-medium text-slate-200">
        Worth a second look before you hand this in
      </h3>
      <ul className="mt-2 space-y-2">
        {flagged.map(({ criterion, past }) => (
          <li key={criterion.id} className="text-[12.5px]">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-slate-100">{criterion.title}</span>
              <span className="font-mono text-[11px] text-slate-500">
                worth {criterion.points}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">
              You have averaged {past!.percentage}% on this across{" "}
              {past!.occasions} marked {past!.occasions === 1 ? "piece" : "pieces"}
              {past!.courses.length > 1 ? ` in ${past!.courses.join(" and ")}` : ""}.
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
        Drawn from your own returned work. Nobody else is shown this.
      </p>
    </section>
  );
}
