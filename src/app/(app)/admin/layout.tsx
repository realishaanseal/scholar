import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { administeredOrganizations } from "@/domains/identity";

export const dynamic = "force-dynamic";

/**
 * Everything under /admin requires administering something.
 *
 * Checked once here rather than in each page: a layout is the only place a
 * whole subtree can be gated without relying on every future page remembering
 * to do it. Someone with no admin membership gets notFound() rather than a
 * refusal, matching the API — a distinct "forbidden" would confirm the
 * console exists and is worth attacking.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await administeredOrganizations(session.user.id);
  if (orgs.length === 0) notFound();

  return <>{children}</>;
}
