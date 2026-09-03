import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { administeredOrganizations } from "@/domains/identity";
import { institutionCourseHealth, institutionMarkingHealth } from "@/domains/insight";

export const dynamic = "force-dynamic";

/**
 * Whether the institution is doing its half.
 *
 * Every figure on this page is about the institution's conduct — work set,
 * work returned, how long people waited. There is deliberately no student
 * ranking, no engagement score and no attention metric, and that absence is a
 * decision rather than an omission. Scholar knows when a student studies and
 * how long they focus; an administrator is not shown it, in aggregate or
 * otherwise, because a chart of "engagement by year group" is a surveillance
 * tool wearing a pastoral coat.
 *
 * Slow marking, by contrast, is an institutional failure, and an institution
 * should be confronted with its own.
 */
export default async function InstitutionHealthPage() {
  const t = await getTranslations("admin");

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await administeredOrganizations(session.user.id);
  const org = orgs[0];
  if (!org) redirect("/dashboard");

  const [marking, courses] = await Promise.all([
    institutionMarkingHealth(org.id),
    institutionCourseHealth(org.id),
  ]);

  const concerns = courses.filter((c) => c.concern);

  return (
    <div>
      <PageHeading
        title={t("healthTitle")}
        subtitle={t("healthSubtitle")}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label={t("healthTypicalWait")}
          value={marking.medianDays === null ? "—" : `${marking.medianDays}d`}
          hint={t("healthTypicalWaitHint")}
        />
        <Stat
          label={t("healthLongestWait")}
          value={
            marking.worstWaitDays === null ? "—" : `${Math.round(marking.worstWaitDays)}d`
          }
          hint={t("healthLongestWaitHint")}
          accent={(marking.worstWaitDays ?? 0) >= 21}
        />
        <Stat
          label={t("healthReturned")}
          value={
            marking.returnRate === null ? "—" : `${Math.round(marking.returnRate * 100)}%`
          }
          hint={t("healthReturnedHint")}
        />
        <Stat
          label={t("healthWaiting")}
          value={marking.outstanding}
          hint={t("healthWaitingHint")}
          accent={marking.outstanding > 0}
        />
      </div>

      {/* The median is the reassuring number and the tail is the true one, so
          the tail gets said in words when it is bad. */}
      {marking.worstWaitDays !== null && marking.worstWaitDays >= 21 && (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
          Someone has been waiting {Math.round(marking.worstWaitDays)} days for work to be
          marked. A typical wait of {marking.medianDays}d is no comfort to them.
        </p>
      )}

      <h2 className="mb-2.5 mt-8 text-[13px] font-medium text-slate-300">
        {concerns.length === 0
          ? t("healthAllHealthy")
          : t("healthNeedsAttention", { count: concerns.length })}
      </h2>

      {concerns.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-12 text-center">
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-slate-400">
            Work is being set and returned across every course. Nothing here needs you.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {concerns.map((c, i) => (
            <Reveal key={c.courseId} y={8} delay={Math.min(i * 0.03, 0.18)}>
              <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3">
                <span className="font-mono text-[12px] text-slate-400">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-slate-100">
                  {c.title}
                </span>
                <span className="text-[12.5px] text-amber-200">{c.concern}</span>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <h2 className="mb-2.5 mt-8 text-[13px] font-medium text-slate-300">Every course</h2>
      <div className="card overflow-x-auto rounded-xl">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="px-3.5 py-2.5 text-start font-medium text-slate-400">Course</th>
              <th className="px-3.5 py-2.5 text-end font-medium text-slate-400">Set</th>
              <th className="px-3.5 py-2.5 text-end font-medium text-slate-400">Waiting</th>
              <th className="px-3.5 py-2.5 text-end font-medium text-slate-400">Longest</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.courseId} className="border-b border-white/[0.04] last:border-0">
                <td className="px-3.5 py-2.5">
                  <span className="font-mono text-[11.5px] text-slate-500">{c.code}</span>{" "}
                  <span className="text-slate-200">{c.title}</span>
                </td>
                <td className="px-3.5 py-2.5 text-end tabular-nums text-slate-300">
                  {c.published}
                </td>
                <td className="px-3.5 py-2.5 text-end tabular-nums text-slate-300">
                  {c.outstanding || "—"}
                </td>
                <td className="px-3.5 py-2.5 text-end tabular-nums text-slate-300">
                  {c.worstWaitDays === null ? "—" : `${Math.round(c.worstWaitDays)}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
        {t("healthNoSurveillanceNote")}
      </p>

      <p className="mt-4">
        <Link href="/admin" className="text-[12.5px] text-slate-500 hover:text-slate-300">
          ← Overview
        </Link>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card rounded-xl px-4 py-3">
      <p className="text-[11.5px] text-slate-500">{label}</p>
      <p
        className={
          accent
            ? "mt-0.5 text-xl font-semibold tabular-nums text-amber-300"
            : "mt-0.5 text-xl font-semibold tabular-nums text-slate-100"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{hint}</p>}
    </div>
  );
}
