import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
import SignOutButton from "@/components/SignOutButton";
import Logo from "@/components/Logo";
import LiveClasses from "@/components/LiveClasses";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firstName = (session.user.name ?? session.user.email ?? "there").split(" ")[0].split("@")[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-985/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={34} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight text-white">
                Varaxis <span className="text-vx-300">Scholar</span>
              </div>
              {/* Tagline is the first thing to go on a phone — the logo already says it. */}
              <div className="hidden text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:block">
                Homework, organised
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {session.user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="h-8 w-8 rounded-full border border-white/15 shadow-lift"
              />
            )}
            <span className="hidden text-xs text-slate-400 md:block">{session.user.email}</span>

            <LiveClasses />

            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="group grid h-9 w-9 place-items-center rounded-xl border border-white/[0.10]
                         bg-white/[0.035] text-slate-400 transition-all duration-300 ease-spring
                         hover:-translate-y-[1px] hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] transition-transform duration-500 group-hover:rotate-90"
                fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.76 1.02 1.4 1.02H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>

            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8 xl:px-10">
        <Dashboard userName={firstName} />
      </main>
    </div>
  );
}
