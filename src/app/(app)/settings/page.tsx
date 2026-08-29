import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import PageHeading from "@/components/PageHeading";
import SettingsNav from "@/components/SettingsNav";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <PageHeading
        title="Settings"
        subtitle="Choose which AI reads your homework, how much time you have to study, and how Scholar looks and talks to you."
      />

      <SettingsNav
        name={session.user.name ?? null}
        email={session.user.email ?? null}
        enabledOAuthProviders={enabledOAuthProviders}
      />
    </div>
  );
}
