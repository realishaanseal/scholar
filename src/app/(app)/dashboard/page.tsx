import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firstName = (session.user.name ?? session.user.email ?? "there").split(" ")[0].split("@")[0];

  return <Dashboard userName={firstName} />;
}
