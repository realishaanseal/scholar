import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
import YourWeek from "@/components/learn/YourWeek";
import { enrolledOrganizations } from "@/domains/learning";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const firstName = (session.user.name ?? session.user.email ?? "there")
    .split(" ")[0]
    .split("@")[0];

  // Only for somebody enrolled somewhere. The independent user Scholar
  // started out serving has their own tasks and no institution to plan
  // around, and a week view built from nothing would be a heading over a gap.
  const orgs = await enrolledOrganizations(session.user.id);

  return (
    <>
      {orgs.length > 0 && (
        <YourWeek userId={session.user.id} organizationId={orgs[0]} />
      )}
      <Dashboard userName={firstName} />
    </>
  );
}
