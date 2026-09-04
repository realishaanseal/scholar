import { digestFor } from "@/domains/guardians";

/**
 * What a guardian is shown about one child.
 *
 * Rendered entirely from GuardianDigest, which is the enforcement: that type
 * has no field for anything from the personal layer, so this component cannot
 * display an effort estimate, a study session or a focus timer even by
 * mistake. Widening what a guardian sees would mean widening the digest, in
 * the domain, where the test that pins it lives.
 *
 * Marks appear only once a teacher has released them. A parent learning a
 * grade before their child does is a specific and avoidable indignity.
 */
export default async function ChildDigest({
  studentId,
  organizationId,
  from,
  to,
}: {
  studentId: string;
  organizationId: string;
  from: string;
  to: string;
}) {
  const digest = await digestFor(studentId, organizationId, from, to);

  const outstanding = digest.courses.reduce((n, c) => n + c.outstanding.length, 0);
  const released = digest.courses.reduce((n, c) => n + c.recent.length, 0);
  const a = digest.attendance;

  const day = (iso: string | null) => {
    if (!iso) return "no deadline";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? "no deadline"
      : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-5">
      <section className="card rounded-xl px-5 py-4">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <Figure label="Work outstanding" value={String(outstanding)} />
          <Figure label="Marks released" value={String(released)} />
          <Figure
            label="Attendance"
            value={a.rate === null ? "—" : `${Math.round(a.rate * 100)}%`}
            note={a.rate === null ? "no sessions recorded" : `${a.present + a.excused} of ${a.present + a.absent + a.late + a.excused}`}
          />
          <Figure label="Absences" value={String(a.absent)} note={a.late > 0 ? `${a.late} late` : undefined} />
        </div>
      </section>

      {digest.courses.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nothing to show yet</p>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Work and marks appear here once the school records them.
          </p>
        </div>
      ) : (
        digest.courses.map((c) => (
          <section key={c.sectionId} className="card rounded-xl px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-[14px] font-medium text-slate-100">{c.courseTitle}</h2>
              <span className="font-mono text-[11.5px] text-slate-500">{c.courseCode}</span>
            </div>

            {c.outstanding.length > 0 && (
              <>
                <p className="mt-3 text-[11.5px] uppercase tracking-wide text-slate-500">
                  Not handed in
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {c.outstanding.map((o, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 text-[13px]">
                      <span className="text-slate-200">{o.title}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-slate-500">
                        {day(o.dueAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {c.recent.length > 0 && (
              <>
                <p className="mt-3.5 text-[11.5px] uppercase tracking-wide text-slate-500">
                  Marks released
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {c.recent.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 text-[13px]">
                      <span className="text-slate-200">{r.title}</span>
                      <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-slate-300">
                        {r.score === null ? "—" : r.points === null ? r.score : `${r.score} / ${r.points}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {c.outstanding.length === 0 && c.recent.length === 0 && (
              <p className="mt-2 text-[12.5px] text-slate-500">
                Nothing outstanding, and no marks released yet.
              </p>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tabular-nums leading-tight text-slate-100">
        {value}
      </p>
      {note && <p className="text-[11.5px] text-slate-500">{note}</p>}
    </div>
  );
}
