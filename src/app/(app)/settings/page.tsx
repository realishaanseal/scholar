import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Settings</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Choose which AI reads your homework, how much time you have to study, and how Scholar looks and talks to you.
        </p>
      </div>

      <SettingsNav
        name={session.user.name ?? null}
        email={session.user.email ?? null}
        enabledOAuthProviders={enabledOAuthProviders}
      />
    </div>
  );
}
