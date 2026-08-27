import TimetablePanel from "@/components/TimetablePanel";

export const dynamic = "force-dynamic";

export default function TimetablePage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Timetable</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Your recurring classes, so Scholar knows when you're free to study.</p>
      </div>
      <TimetablePanel />
    </div>
  );
}
