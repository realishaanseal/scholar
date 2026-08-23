import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Logo from "@/components/Logo";
import HomeIntroGate from "@/components/HomeIntroGate";

/**
 * Signed-out landing page.
 *
 * Structure follows the shape a product site is expected to have — header,
 * a claim, the product itself, then supporting detail — rather than stacking
 * the brand name repeatedly. The <h1> is deliberately a statement about what
 * the app does, not the product name: the name already sits in the header,
 * the tab title and the logo, and an <h1> spent on it says nothing to
 * someone deciding whether this is worth signing up for.
 */

const FEATURES = [
  {
    t: "Capture it however it comes out",
    d: "Type it, or hold the mic and ramble. Speech is transcribed in your browser — the audio never leaves your device.",
    icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  },
  {
    t: "It arrives already sorted",
    d: "The subject, deadline and rough effort get pulled out for you. You see the result before anything is saved.",
    icon: "M12 2l1.9 5.5L19 9l-5.1 1.5L12 16l-1.9-5.5L5 9l5.1-1.5z",
  },
  {
    t: "The urgent things surface",
    d: "Work reorders itself as deadlines close in, so the thing you should be doing now is the thing at the top.",
    icon: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
];

/** Representative rows for the product preview below the hero. */
const PREVIEW = [
  {
    subject: "Physics",
    colour: "#5b7cfa",
    due: "Due in 2 hours",
    dueClass: "border-orange-500/30 text-orange-300 bg-orange-500/[0.12]",
    title: "Problem set 7 — rotational dynamics",
    meta: "~45 min",
    high: true,
  },
  {
    subject: "English",
    colour: "#c07ef5",
    due: "Due tomorrow",
    dueClass: "border-amber-500/25 text-amber-300 bg-amber-500/[0.10]",
    title: "Essay draft — unreliable narrators in Gatsby",
    meta: "~90 min · captured by voice",
    high: false,
  },
  {
    subject: "Chemistry",
    colour: "#34d399",
    due: "Friday",
    dueClass: "border-white/[0.08] text-slate-400 bg-white/[0.035]",
    title: "Lab report — titration results write-up",
    meta: "~60 min",
    high: false,
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <HomeIntroGate>
      <div className="flex min-h-screen flex-col">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="animate-fadeIn mx-auto flex w-full max-w-[1180px] items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            {/* The full product name appears exactly once on the page, here —
                the <h1> is spent on a claim instead. Drops to "Scholar" on
                narrow screens so the header doesn't crowd the two actions. */}
            <span className="text-[15px] font-semibold tracking-tight text-white">
              <span className="hidden sm:inline">Varaxis </span>Scholar
            </span>
          </div>

          <nav className="flex items-center gap-1.5">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm text-slate-300 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary px-4 py-2 text-sm">
              Get started
            </Link>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-6">
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <section className="mx-auto max-w-[760px] pt-16 text-center sm:pt-24">
            <h1
              className="animate-riseIn text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-6xl"
              style={{ ["--i" as any]: 0 }}
            >
              Homework, sorted
              <br className="hidden sm:block" />{" "}
              <span className="gradient-text">before it&rsquo;s urgent</span>
            </h1>

            <p
              className="animate-riseIn stagger mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-slate-400"
              style={{ ["--i" as any]: 2 }}
            >
              Say it or type it, however messily. Scholar rewrites it into a clean
              assignment, works out the subject and the deadline, and puts the things
              that are about to bite you right at the top.
            </p>

            <div
              className="animate-riseIn stagger mt-9 flex flex-wrap items-center justify-center gap-3"
              style={{ ["--i" as any]: 4 }}
            >
              <Link href="/signup" className="btn-primary px-6 py-3 text-[15px]">
                Get started
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="px-3 py-3 text-[15px] text-slate-400 transition-colors hover:text-white"
              >
                I already have an account
              </Link>
            </div>
          </section>

          {/* ── Product preview ──────────────────────────────────────── */}
          <section
            className="animate-riseIn stagger relative mx-auto mt-16 max-w-[840px] sm:mt-20"
            style={{ ["--i" as any]: 6 }}
          >
            {/* Glow pooled under the panel so it reads as lit rather than pasted on. */}
            <div
              /* inset-x-0, not a negative inset: a negative one widens the
                 element's box past the viewport and adds horizontal scroll on
                 narrow screens. The blur spreads the glow outward visually
                 without affecting layout, so it still reads as unbounded. */
              className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.22), transparent 70%)",
              }}
              aria-hidden
            />

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <span className="text-[13px] font-semibold text-white">Today</span>
                <span className="text-[11px] text-slate-500">3 due · 3h 15m of work</span>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {PREVIEW.map((row) => (
                  <div key={row.subject} className="relative flex items-start gap-3.5 px-5 py-4">
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{
                        background: `linear-gradient(180deg, ${row.colour}, ${row.colour}22)`,
                        boxShadow: `0 0 18px ${row.colour}55`,
                      }}
                      aria-hidden
                    />

                    <span
                      className="mt-0.5 h-[19px] w-[19px] shrink-0 rounded-md border border-white/20"
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="chip border"
                          style={{
                            background: `${row.colour}18`,
                            color: row.colour,
                            borderColor: `${row.colour}33`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: row.colour, boxShadow: `0 0 8px ${row.colour}` }}
                          />
                          {row.subject}
                        </span>

                        <span className={`chip border ${row.dueClass}`}>
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          {row.due}
                        </span>

                        {row.high && (
                          <span className="chip bg-red-500/[0.13] text-red-300 border border-red-500/25">
                            High
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 text-[14.5px] font-medium leading-snug text-white">
                        {row.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">{row.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Features ─────────────────────────────────────────────── */}
          <section className="mx-auto mt-24 max-w-[980px] border-t border-white/[0.06] pt-14 sm:mt-32">
            <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
              {FEATURES.map((f, i) => (
                <div key={f.t} className="animate-riseIn stagger" style={{ ["--i" as any]: 7 + i }}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[19px] w-[19px] text-vx-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d={f.icon} />
                  </svg>
                  <h2 className="mt-3.5 text-[14.5px] font-semibold tracking-tight text-white">
                    {f.t}
                  </h2>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">{f.d}</p>
                </div>
              ))}
            </div>
          </section>
        </main>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="mx-auto mt-24 w-full max-w-[1180px] px-6 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-7">
            <span className="text-xs text-slate-600">© 2026 Varaxis</span>
            <Link
              href="/privacy"
              className="text-xs text-slate-600 transition-colors hover:text-slate-400"
            >
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </HomeIntroGate>
  );
}
