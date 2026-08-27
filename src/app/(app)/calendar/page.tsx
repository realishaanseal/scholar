import CalendarPanel from "@/components/CalendarPanel";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Calendar</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Export or sync your deadlines and classes to an external calendar.</p>
      </div>
      <CalendarPanel />
    </div>
  );
}
