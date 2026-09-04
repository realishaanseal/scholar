import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { auth } from "@/lib/auth";
import {
  administeredOrganizations, getCurrentAcademicYear, listTerms,
} from "@/domains/identity";
import { assessmentLoad, BUSY_MINS } from "@/domains/insight/load";

export const dynamic = "force-dynamic";

/**
 * When the institution's work falls due.
 *
 * The teacher's deadline warning covers one class. This is the view nobody
 * has: four pieces on the same Friday across three departments, which no
 * individual teacher can see because none of them is looking at more than one.
 *
 * About the timetable of work rather than the people doing it. No student is
 * named or counted anywhere on this page, which is what separates it from the
 * engagement dashboard Phase 10 declined.
 */
export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = (await administeredOrganizations(session.user.id))[0];
  if (!org) redirect("/dashboard");

  const { term: termParam } = await searchParams;
  const year = await getCurrentAcademicYear(org.id);
  const terms = year ? await listTerms(year.id) : [];

  const today = new Date().toISOString().slice(0, 10);
  const chosen =
    terms.find((t) => t.id === termParam) ??
    terms.find((t) => t.startsOn <= today && today <= t.endsOn) ??
    terms[terms.length - 1] ??
    null;

  const from = chosen?.startsOn ?? today;
  const to =
    chosen?.endsOn ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const { days, heaviest } = await assessmentLoad(org.id, from, to);
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;
  const busiest = days.reduce((m, d) => Math.max(m, d.estimatedMins), 0);

  const weekday = (iso: string) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short",
    });

  return (
    <div>
      <PageHeading
        title="Assessment calendar"
        subtitle={chosen ? `${chosen.name} · ${days.length} days with work due` : `${from} to ${to}`}
      />

      {terms.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {terms.map((t) => (
            <a
              key={t.id}
              href={`/admin/calendar?term=${t.id}`}
              className={
                t.id === chosen?.id
                  ? "rounded-lg border border-vx-500/40 bg-vx-500/10 px-3 py-1.5 text-[12.5px] text-vx-200"
                  : "rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12.5px] text-slate-400 hover:border-white/[0.16]"
              }
            >
              {t.name}
            </a>
          ))}
        </div>
      )}

      {heaviest.length > 0 && (
        <section className="card mb-5 rounded-xl border-amber-400/25 bg-amber-400/[0.04] px-4 py-4">
          <p className="text-[11.5px] uppercase tracking-wide text-amber-300/80">
            Days carrying more than {hours(BUSY_MINS)} hours across several courses
          </p>
          <ul className="mt-2.5 space-y-2">
            {heaviest.slice(0, 5).map((d) => (
              <li key={d.day} className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
                <span className="min-w-[8.5rem] text-slate-100">{weekday(d.day)}</span>
                <span className="tabular-nums text-amber-200">{hours(d.estimatedMins)} hours</span>
                <span className="text-slate-400">
                  {d.pieces} {d.pieces === 1 ? "piece" : "pieces"} · {d.courses.join(", ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[78ch] text-[11.5px] leading-relaxed text-slate-500">
            No single teacher can see this. Each set one piece of work into a day that
            already had three.
          </p>
        </section>
      )}

      {days.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nothing due in this period</p>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Published work with a deadline appears here.
          </p>
        </div>
      ) : (
        <div className="card rounded-xl px-4 py-4">
          <ul className="space-y-2">
            {days.map((d) => {
              const width = busiest > 0 ? Math.max(2, (d.estimatedMins / busiest) * 100) : 2;
              const busy = d.estimatedMins >= BUSY_MINS && d.courses.length > 1;
              return (
                <li key={d.day}>
                  <div className="flex flex-wrap items-baseline gap-x-3 text-[12.5px]">
                    <span className="min-w-[8.5rem] text-slate-300">{weekday(d.day)}</span>
                    <span className="tabular-nums text-slate-400">
                      {d.estimatedMins > 0 ? `${hours(d.estimatedMins)}h` : "—"}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {d.courses.join(" · ")}
                    </span>
                    {d.unestimated > 0 && (
                      <span className="text-[11px] text-slate-600">
                        {d.unestimated} without an estimate
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={busy ? "h-full rounded-full bg-amber-400/70" : "h-full rounded-full bg-vx-500/60"}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3.5 text-[11.5px] leading-relaxed text-slate-500">
            Hours are what teachers estimated when setting the work. Days with no estimate
            are shown at their piece count only.
          </p>
        </div>
      )}
    </div>
  );
}
