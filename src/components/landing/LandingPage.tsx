"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import Logo from "@/components/Logo";
import { EASE_OUT, Magnetic, Reveal, SPRING, Stagger, StaggerItem, TiltCard } from "@/components/motion";

/**
 * Signed-out landing page (client — it's all Motion choreography). The server
 * component only does the auth-redirect; everything visual lives here.
 *
 * `revealed` is held false until the cinematic intro begins its exit (see
 * HomeIntroGate), so the whole above-the-fold composition rises in during the
 * intro's dissolve rather than sitting finished behind it.
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

const HEAD_WORDS = ["Homework,", "sorted", "before"];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_OUT } },
};

const dropIn: Variants = {
  hidden: { opacity: 0, y: -14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

const shotIn: Variants = {
  hidden: { opacity: 0, y: 48, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 1.0, ease: EASE_OUT } },
};

export default function LandingPage({ revealed = true }: { revealed?: boolean }) {
  const state = revealed ? "show" : "hidden";

  return (
    <div className="flex min-h-screen flex-col">
      <motion.div initial="hidden" animate={state} variants={container}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <motion.header
          variants={dropIn}
          className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 py-6"
        >
          <div className="flex items-center gap-2.5">
            <motion.span whileHover={{ rotate: -8, scale: 1.06 }} transition={SPRING} className="block">
              <Logo size={30} />
            </motion.span>
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
            <Magnetic>
              <Link href="/signup" className="btn-primary px-4 py-2 text-sm">
                Get started
              </Link>
            </Magnetic>
          </nav>
        </motion.header>

        <div className="mx-auto w-full max-w-[1280px] px-6">
          <div className="grid items-center gap-12 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:pt-16">
            <section className="text-center lg:text-left">
              <h1 className="text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-6xl">
                <span className="sr-only">Homework, sorted before it’s urgent</span>
                <span aria-hidden className="inline-block">
                  {HEAD_WORDS.map((w) => (
                    <motion.span key={w} variants={rise} className="mr-[0.28em] inline-block">
                      {w}
                    </motion.span>
                  ))}
                  <motion.span variants={rise} className="gradient-text inline-block">
                    it’s urgent
                  </motion.span>
                </span>
              </h1>

              <motion.p
                variants={rise}
                className="mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-slate-400 lg:mx-0"
              >
                Say it or type it, however messily. Scholar rewrites it into a clean
                assignment, works out the subject and the deadline, and puts the things
                that are about to bite you right at the top.
              </motion.p>

              <motion.div
                variants={rise}
                className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <Magnetic>
                  <Link href="/signup" className="btn-primary px-6 py-3 text-[15px]">
                    Get started
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </Magnetic>
                <Link
                  href="/login"
                  className="px-3 py-3 text-[15px] text-slate-400 transition-colors hover:text-white"
                >
                  I already have an account
                </Link>
              </motion.div>
            </section>

            {/* ── Product preview ──────────────────────────────────────── */}
            <motion.section
              variants={shotIn}
              className="relative mx-auto w-full max-w-[840px] lg:mt-0 lg:max-w-none"
              style={{ perspective: 1200 }}
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 blur-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18), transparent 70%)",
                }}
                animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.05, 1] }}
                transition={{ duration: 9, ease: "easeInOut", repeat: Infinity }}
              />

              <TiltCard className="card overflow-hidden" max={7}>
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                  <span className="text-[13px] font-semibold text-white">Today</span>
                  <span className="text-[11px] text-slate-500">3 due · 3h 15m of work</span>
                </div>

                <Stagger className="divide-y divide-white/[0.05]" stagger={0.1} delay={0.15}>
                  {PREVIEW.map((row) => (
                    <StaggerItem key={row.subject} className="relative flex items-start gap-3.5 px-5 py-4">
                      <span
                        className="absolute inset-y-0 left-0 w-[3px]"
                        style={{
                          background: `linear-gradient(180deg, ${row.colour}, ${row.colour}22)`,
                          boxShadow: `0 0 18px ${row.colour}55`,
                        }}
                        aria-hidden
                      />
                      <span className="mt-0.5 h-[19px] w-[19px] shrink-0 rounded-md border border-white/20" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="chip border"
                            style={{ background: `${row.colour}18`, color: row.colour, borderColor: `${row.colour}33` }}
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
                            <span className="chip bg-red-500/[0.13] text-red-300 border border-red-500/25">High</span>
                          )}
                        </div>
                        <h3 className="mt-2 text-[14.5px] font-medium leading-snug text-white">{row.title}</h3>
                        <p className="mt-1 text-[11px] text-slate-500">{row.meta}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </TiltCard>
            </motion.section>
          </div>
        </div>
      </motion.div>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6">
        {/* ── Features ─────────────────────────────────────────────── */}
        <section className="mx-auto mt-24 max-w-[980px] border-t border-white/[0.06] pt-14 sm:mt-32">
          <Stagger className="grid gap-10 sm:grid-cols-3 sm:gap-8" stagger={0.12}>
            {FEATURES.map((f) => (
              <StaggerItem key={f.t}>
                <motion.svg
                  viewBox="0 0 24 24"
                  className="h-[19px] w-[19px] text-vx-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  whileHover={{ scale: 1.2, rotate: 6 }}
                  transition={SPRING}
                >
                  <path d={f.icon} />
                </motion.svg>
                <h2 className="mt-3.5 text-[14.5px] font-semibold tracking-tight text-white">{f.t}</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">{f.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <Reveal as="footer" className="mx-auto mt-24 w-full max-w-[1280px] px-6 pb-10" y={10}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-7">
          <span className="text-xs text-slate-600">© 2026 Varaxis</span>
          <Link
            href="/privacy"
            className="inline-block py-2 text-xs text-slate-600 transition-colors hover:text-slate-400"
          >
            Privacy
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
