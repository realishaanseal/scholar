import PageHeading from "@/components/PageHeading";
import TimetablePanel from "@/components/TimetablePanel";

export const dynamic = "force-dynamic";

export default function TimetablePage() {
  return (
    <div>
      <PageHeading title="Timetable" />
      <TimetablePanel />
    </div>
  );
}
