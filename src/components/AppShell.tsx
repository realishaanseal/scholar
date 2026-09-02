"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import Logo from "./Logo";
import SignOutButton from "./SignOutButton";
import LiveClasses from "./LiveClasses";
import ThemeLoader from "./ThemeLoader";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Filled icons read better at this size than stroked outlines (matches
   *  the AI-settings icon convention already used in SettingsNav). */
  filled?: boolean;
};

/**
 * Top-level destinations, each a full page rather than a tab hidden inside
 * Settings — these are things a student actually comes back to look at
 * (today's classes, what's due, an import), not configuration they set once
 * and forget. Settings itself is still here, last, for the handful of
 * sections that really are settings (AI provider, alerts, appearance...).
 */
const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Homework",
    icon: "M4 4h16v4H4zM4 10h10v10H4zM16 10h4v10h-4z",
  },
  {
    href: "/timetable",
    label: "Timetable",
    icon: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  },
  {
    href: "/import",
    label: "Import",
    // A graduation cap — "bring in work from school" (LMS/notice import) —
    // rather than a generic download arrow, which read as "download a file"
    // instead of "import from your school."
    icon: "M12 3L2 8l10 5 8-4v6M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5",
  },
  {
    href: "/calendar",
    label: "Calendar",
    // A refresh/sync glyph rather than another grid — Timetable is the
    // schedule itself, this page is about exporting/syncing it elsewhere,
    // so the two need to read as clearly different destinations at a glance.
    icon: "M4 4v6h6M20 20v-6h-6M4.5 10a8 8 0 0 1 14.6-3.5M19.5 14a8 8 0 0 1-14.6 3.5",
  },
  {
    href: "/extension",
    label: "Extension",
    icon: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l1.3-1.3a4 4 0 1 1-5.6 5.6l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a4 4 0 1 1 5.6-5.6z",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    href: "/groups",
    label: "Groups",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
];

/**
 * Shown only to people who actually teach a section.
 *
 * A nav item that leads to an empty page for almost every user is worse than
 * no nav item: it makes the product feel like it is about something the
 * person is not doing. Whether to show it is resolved server-side from real
 * teaching assignments, not from a role string.
 */
const TEACHING_ITEM: NavItem = {
  href: "/teach",
  label: "Teaching",
  icon: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
};

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  // A real gear, not the sparkle glyph the old AI-settings tab used —
  // Settings needs to read unmistakably as configuration at a glance.
  icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.76 1.02 1.4 1.02H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  filled: false,
};

function NavIcon({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      className={`group relative grid h-11 w-11 place-items-center rounded-xl border transition-colors duration-200 ${
        active
          ? "border-transparent text-white"
          : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active-rail"
          aria-hidden
          className="absolute inset-0 rounded-xl"
          style={{ background: "var(--grad-brand)", boxShadow: "0 8px 26px -10px hsl(var(--accent-h-2) var(--accent-s) 45% / 0.7)" }}
          transition={SPRING}
        />
      )}
      <motion.svg
        viewBox="0 0 24 24"
        className="relative z-[1] h-[19px] w-[19px]"
        fill={item.filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        whileHover={{ scale: 1.15, y: -1 }}
        whileTap={{ scale: 0.9 }}
        transition={SPRING}
      >
        <path d={item.icon} />
      </motion.svg>
      <span className="pointer-events-none absolute start-full ms-3 z-10 whitespace-nowrap rounded-lg border border-white/10 bg-ink-950 px-2.5 py-1.5 text-[11.5px] font-medium text-white opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100 max-lg:hidden">
        {item.label}
      </span>
    </Link>
  );
}

/**
 * The app's persistent navigation shell: an icon rail on the left (desktop)
 * that collapses to a bottom tab bar (mobile), plus a slim top bar with
 * brand, current user, and sign-out. Every authenticated route renders
 * inside this, and each route change cross-fades through <AnimatePresence>.
 */
export default function AppShell({
  children,
  userEmail,
  userImage,
  showTeaching = false,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  userImage?: string | null;
  /** True when this person teaches at least one section. */
  showTeaching?: boolean;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  // Teaching sits after the personal destinations: Scholar is a student's tool
  // first, and a teacher is a student's teacher second.
  const items = showTeaching ? [...NAV, TEACHING_ITEM] : NAV;

  return (
    <div className="min-h-screen lg:flex">
      <ThemeLoader />
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[76px] flex-col items-center gap-1.5 border-e border-white/[0.06] bg-ink-985/80 py-4 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="mb-3">
          <motion.span className="block" whileHover={{ rotate: -8, scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={SPRING}>
            <Logo size={34} />
          </motion.span>
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {items.map((item) => (
            <NavIcon key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-white/[0.06] pt-3">
          <NavIcon item={SETTINGS_ITEM} active={isActive(SETTINGS_ITEM.href)} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:ps-[76px]">
        {/* Top bar — brand on mobile (rail replaces it on desktop), user info, sign out */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-985/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 xl:px-10">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <Logo size={30} />
              <span className="truncate text-sm font-semibold tracking-tight text-white">
                Varaxis <span className="text-vx-300">Scholar</span>
              </span>
            </Link>
            <div className="hidden lg:block" />

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {userImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userImage} alt="" className="h-8 w-8 rounded-full border border-white/15 shadow-lift" />
              )}
              {userEmail && <span className="hidden text-xs text-slate-400 md:block">{userEmail}</span>}
              <LiveClasses />
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pb-8 xl:px-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom tab bar — the rail's small-screen equivalent */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/[0.07] bg-ink-985/90 px-1 py-1.5 backdrop-blur-xl lg:hidden">
          {[...items, SETTINGS_ITEM].map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors ${
                  active ? "text-white" : "text-slate-500"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-mobile"
                    aria-hidden
                    className="absolute inset-x-2 top-0 h-[2px] rounded-full"
                    style={{ background: "var(--grad-brand)" }}
                    transition={SPRING}
                  />
                )}
                <motion.svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill={item.filled ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  animate={active ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }}
                  transition={SPRING}
                >
                  <path d={item.icon} />
                </motion.svg>
                <span className="truncate text-[9.5px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
