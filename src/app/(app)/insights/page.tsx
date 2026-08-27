import AnalyticsPanel from "@/components/AnalyticsPanel";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Insights</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">How your work actually goes — pace, estimates, and patterns.</p>
      </div>
      <AnalyticsPanel />
    </div>
  );
}
