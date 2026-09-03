import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import TimeSettings from "@/components/admin/TimeSettings";
import { auth } from "@/lib/auth";
import { administeredOrganizations, getOrganizationTime } from "@/domains/identity";

export const dynamic = "force-dynamic";

/**
 * Institution settings.
 *
 * Currently two, and both of them are things Scholar used to assume: that
 * everybody is on one clock, and that the weekend is Saturday and Sunday.
 * Neither was ever true everywhere, and both were wrong silently — a deadline
 * that meant something different than the teacher intended, and study time
 * allocated on days students were at school.
 */
export default async function InstitutionSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await administeredOrganizations(session.user.id);
  const org = orgs[0];
  if (!org) redirect("/dashboard");

  const time = await getOrganizationTime(org.id);

  return (
    <div>
      <PageHeading
        title="Settings"
        subtitle={`How ${org.name} keeps time, and when its students are free.`}
      />

      <TimeSettings
        initialTimezone={time.timezone}
        initialRestDays={time.restDays}
        initialScheme={time.gradingScheme}
        initialAiPolicy={time.aiPolicy}
      />

      <p className="mt-8">
        <Link href="/admin" className="text-[12.5px] text-slate-500 hover:text-slate-300">
          ← Overview
        </Link>
      </p>
    </div>
  );
}
