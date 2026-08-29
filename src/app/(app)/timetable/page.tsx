import PageHeading from "@/components/PageHeading";
import TimetablePanel from "@/components/TimetablePanel";

export const dynamic = "force-dynamic";

export default function TimetablePage() {
  return (
    <div>
      <PageHeading
        title="Timetable"
        subtitle="Your recurring classes, so Scholar knows when you're free to study."
      />
      <TimetablePanel />
    </div>
  );
}
