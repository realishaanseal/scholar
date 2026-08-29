import PageHeading from "@/components/PageHeading";
import AnalyticsPanel from "@/components/AnalyticsPanel";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  return (
    <div>
      <PageHeading
        title="Insights"
        subtitle="How your work actually goes — pace, estimates, and patterns."
      />
      <AnalyticsPanel />
    </div>
  );
}
