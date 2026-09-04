import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { auth } from "@/lib/auth";
import {
  administeredOrganizations, getCurrentAcademicYear, listTerms,
} from "@/domains/identity";
import { attendanceForOrganization } from "@/domains/attendance";

export const dynamic = "force-dynamic";

/**
 * Attendance across the institution.
 *
 * Phase 22 built the register and the per-student read and never surfaced
 * either to an administrator, which left its own exit criterion unmet: a term's
 * attendance for one student was computable and not obtainable.
 *
 * Deliberately not sorted worst-first, and deliberately carrying no flag, no
 * threshold and no colour scale below the raw numbers. Attendance is a
 * statutory record that an administrator reads; a ranking of children by
 * presence is a different document, and Phase 10's refusal of engagement
 * metrics applies to it just as much.
 */
export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = (await administeredOrganizations(session.user.id))[0];
  if (!org) redirect("/dashboard");

  const { term: termParam } = await searchParams;
  // Terms hang off an academic year, not off the organization directly.
  const year = await getCurrentAcademicYear(org.id);
  const terms = year ? await listTerms(year.id) : [];

  // Default to the term containing today, then the most recent, then a
  // trailing window so the page says something on a fresh institution.
  const today = new Date().toISOString().slice(0, 10);
  const chosen =
    terms.find((t) => t.id === termParam) ??
    terms.find((t) => t.startsOn <= today && today <= t.endsOn) ??
    terms[terms.length - 1] ??
    null;

  const from = chosen?.startsOn ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const to = chosen?.endsOn ?? today;

  const rows = await attendanceForOrganization(org.id, from, to);
  const held = rows.reduce((n, r) => n + r.sessions, 0);

  return (
    <div>
      <PageHeading
        title="Attendance"
        subtitle={
          chosen
            ? `${chosen.name} · ${from} to ${to}`
            : `${from} to ${to}`
        }
      />

      {terms.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {terms.map((t) => (
            <a
              key={t.id}
              href={`/admin/attendance?term=${t.id}`}
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

      {rows.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-slate-200">No registers taken</p>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Attendance appears here once teachers take a register in this period.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto rounded-xl">
          <table className="w-full text-[13px]">
            <caption className="sr-only">
              Attendance by student for {chosen?.name ?? "the selected period"}
            </caption>
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th scope="col" className="px-4 py-2.5 text-start text-[11px] uppercase tracking-wide text-slate-500">Student</th>
                <th scope="col" className="px-3 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Present</th>
                <th scope="col" className="px-3 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Late</th>
                <th scope="col" className="px-3 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Excused</th>
                <th scope="col" className="px-3 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Absent</th>
                <th scope="col" className="px-3 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Sessions</th>
                <th scope="col" className="px-4 py-2.5 text-end text-[11px] uppercase tracking-wide text-slate-500">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-white/[0.05] last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-start font-normal text-slate-200">
                    {r.name ?? r.email ?? r.userId}
                  </th>
                  <td className="px-3 py-2.5 text-end tabular-nums text-slate-300">{r.present}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums text-slate-300">{r.late}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums text-slate-300">{r.excused}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums text-slate-300">{r.absent}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums text-slate-500">{r.sessions}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-slate-100">
                    {r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mt-3 text-[11.5px] text-slate-500">
          {rows.length} {rows.length === 1 ? "student" : "students"} · {held} marks recorded.
          Excused and late both count as attending.
        </p>
      )}
    </div>
  );
}
