import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import StudentPatterns from "@/components/learn/StudentPatterns";
import EstimateReceipts from "@/components/learn/EstimateReceipts";
import { auth } from "@/lib/auth";
import { enrolledOrganizations } from "@/domains/learning";

export const dynamic = "force-dynamic";

/**
 * How a student's work actually goes.
 *
 * Two halves with different sources. The personal half — pace, estimates,
 * where the time went — comes from what Scholar has measured about them. The
 * institutional half is new: where their marks go across every course, and
 * what was set on days they were away.
 *
 * The institutional half only appears for somebody enrolled somewhere, which
 * is what keeps this page meaningful for the independent user Scholar started
 * out serving.
 */
export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await enrolledOrganizations(session.user.id);

  return (
    <div>
      <PageHeading title="Insights" />

      {/* Their own measurements first. These apply whether or not an
          institution is involved, and they are the ones Scholar has been
          quietly keeping without ever showing anybody. */}
      <EstimateReceipts userId={session.user.id} />

      {orgs.length > 0 && (
        <div className="mb-6">
          <StudentPatterns userId={session.user.id} organizationId={orgs[0]} />
        </div>
      )}

      <AnalyticsPanel />
    </div>
  );
}
