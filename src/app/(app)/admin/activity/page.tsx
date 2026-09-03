import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import PageHeading from "@/components/PageHeading";
import { auth } from "@/lib/auth";
import { administeredOrganizations } from "@/domains/identity";
import { recentAudit } from "@/lib/governance";

export const dynamic = "force-dynamic";

/** Plain English for the verbs the log records. */
const LABEL: Record<string, string> = {
  "authz:denied": "was refused access to",
  "assignment:publish": "published",
  "assignment:delete": "deleted",
  "submission:grade": "marked",
  "file:download": "opened",
  "file:delete": "deleted the file",
  "member:add": "added",
  "member:suspend": "suspended",
  "quiz:publish": "published the quiz",
};

/**
 * What has been done here lately.
 *
 * An institution holding minors' coursework has to be able to answer "who saw
 * this, and when" — to a parent, a safeguarding lead, or a regulator — and an
 * answer that depends on a server's console buffer still existing is not an
 * answer.
 *
 * What is here is consequential action: things that changed, things that were
 * refused, and the small number of reads that are themselves sensitive.
 * Ordinary reading is absent on purpose. A row per page view would be a
 * surveillance system in its own right, built accidentally out of a compliance
 * requirement, and it would bury the entries that matter under the ones that
 * do not.
 */
export default async function ActivityPage() {
  const t = await getTranslations("admin");

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await administeredOrganizations(session.user.id);
  const org = orgs[0];
  if (!org) redirect("/dashboard");

  const entries = await recentAudit(org.id, 200);
  const refusals = entries.filter((e) => e.action === "authz:denied").length;

  return (
    <div>
      <PageHeading
        title={t("activityTitle")}
        subtitle={t("activitySubtitle")}
      />

      {refusals > 0 && (
        <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
          {t("activityRefused", { count: refusals })}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">{t("activityEmptyTitle")}</p>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate-400">
            Marking, publishing and file access will appear here as they happen.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto rounded-xl">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="px-3.5 py-2.5 text-start font-medium text-slate-400">When</th>
                <th className="px-3.5 py-2.5 text-start font-medium text-slate-400">Who</th>
                <th className="px-3.5 py-2.5 text-start font-medium text-slate-400">What</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-500">
                    {new Date(e.createdAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-300">
                    {/* A departed account leaves a legible row rather than an
                        anonymous one: the trail outlives the person. */}
                    {e.actorLabel || (e.actorUserId ? e.actorUserId.slice(0, 8) : "—")}
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-300">
                    <span
                      className={
                        e.action === "authz:denied" ? "text-amber-300" : "text-slate-300"
                      }
                    >
                      {LABEL[e.action] ?? e.action}
                    </span>{" "}
                    <span className="text-slate-500">
                      {e.subjectType}
                      {e.subjectId && ` ${e.subjectId.slice(0, 8)}`}
                    </span>
                    {Object.keys(e.detail).length > 0 && (
                      <span className="ms-1.5 text-[11.5px] text-slate-600">
                        {Object.entries(e.detail)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
        {t("activityNoPageViews")}
      </p>

      <p className="mt-4">
        <Link href="/admin" className="text-[12.5px] text-slate-500 hover:text-slate-300">
          ← Overview
        </Link>
      </p>
    </div>
  );
}
