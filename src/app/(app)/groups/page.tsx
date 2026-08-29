import PageHeading from "@/components/PageHeading";
import GroupsPanel from "@/components/GroupsPanel";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  return (
    <div>
      <PageHeading title="Groups" subtitle="Shared boards for group work." />
      <GroupsPanel />
    </div>
  );
}
