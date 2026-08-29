import PageHeading from "@/components/PageHeading";
import CalendarPanel from "@/components/CalendarPanel";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <PageHeading
        title="Calendar"
        subtitle="Export or sync your deadlines and classes to an external calendar."
      />
      <CalendarPanel />
    </div>
  );
}
