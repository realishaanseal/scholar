import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import Logo from "@/components/Logo";
import SettingsNav from "@/components/SettingsNav";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-985/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6 py-3.5 xl:px-10">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Logo size={34} />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-white">
                Varaxis <span className="text-vx-300">Scholar</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Settings</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn-ghost px-3.5 py-2 text-xs">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Back to homework
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-6 py-8 xl:px-10">
        <div className="mb-7 animate-riseIn">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="gradient-text">Settings</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Choose which AI reads your homework, how much time you have to study, and what Scholar has learned.
          </p>
        </div>

        <SettingsNav
          name={session.user.name ?? null}
          email={session.user.email ?? null}
          enabledOAuthProviders={enabledOAuthProviders}
        />
      </main>
    </div>
  );
}
