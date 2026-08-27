import GroupsPanel from "@/components/GroupsPanel";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Groups</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Shared boards for group work.</p>
      </div>
      <GroupsPanel />
    </div>
  );
}
