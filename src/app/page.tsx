import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Logo from "@/components/Logo";
import HomeIntroGate from "@/components/HomeIntroGate";

const FEATURES = [
  {
    t: "Capture",
    d: "Type it, or tap the mic and ramble. Transcription happens in your browser — nothing is uploaded.",
    icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  },
  {
    t: "Clean up",
    d: "AI rewrites it into a clear task, pulls out the subject, deadline and effort — you approve before it saves.",
    icon: "M12 2l1.9 5.5L19 9l-5.1 1.5L12 16l-1.9-5.5L5 9l5.1-1.5z",
  },
  {
    t: "Stay ahead",
    d: "Overdue and due-today work rises to the top, colour-coded by subject, so nothing sneaks up on you.",
    icon: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <HomeIntroGate>
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col items-center justify-center px-6 py-20 text-center">
      <div className="animate-fadeIn">
        <span className="chip border border-vx-500/25 bg-vx-500/[0.10] text-vx-200">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-vx-400" />
          A Varaxis product
        </span>
      </div>

      <div className="mt-8 animate-riseIn">
        <Logo size={64} />
      </div>

      <h1 className="mt-7 animate-riseIn stagger text-6xl font-semibold tracking-tight sm:text-7xl" style={{ ["--i" as any]: 1 }}>
        <span className="gradient-text">Varaxis Scholar</span>
      </h1>

      <p className="mt-6 max-w-2xl animate-riseIn stagger text-lg leading-relaxed text-slate-400" style={{ ["--i" as any]: 2 }}>
        Say it or type it, however messily. Scholar rewrites it into a clean assignment,
        works out the subject and the deadline, and puts the things that are about to bite
        you right at the top.
      </p>

      <div className="mt-10 flex animate-riseIn stagger flex-wrap items-center justify-center gap-3" style={{ ["--i" as any]: 3 }}>
        <Link href="/signup" className="btn-primary px-7 py-3.5 text-base">
          Create an account
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
        <Link href="/login" className="btn-ghost px-7 py-3.5 text-base">
          Sign in
        </Link>
      </div>

      <div className="mt-20 grid w-full max-w-5xl gap-5 text-left sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.t}
            className="card card-hover animate-riseIn stagger p-6"
            style={{ ["--i" as any]: 4 + i }}
          >
            <span
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.03]"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06)" }}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-vx-300" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={f.icon} />
              </svg>
            </span>
            <div className="mt-4 text-sm font-semibold text-white">{f.t}</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.d}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-xs text-slate-600">© Varaxis · Internal development build</p>
    </main>
    </HomeIntroGate>
  );
}
