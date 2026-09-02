"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/components/motion";
import { cn } from "@/lib/cn";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspaces";

/**
 * Moving between the sides of the product.
 *
 * Rendered only when a person actually has more than one — most people have
 * exactly one job here, and a control that never does anything is worse than
 * no control. For the few who teach and study, or administer and teach, this
 * is the only way across.
 *
 * It shows where you are rather than offering a menu of everything, because
 * the question it answers is "which hat am I wearing", and that should be
 * legible without opening anything.
 */
export default function WorkspaceSwitcher({
  current,
  available,
}: {
  current: WorkspaceId;
  available: WorkspaceId[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // One workspace is the common case, and it needs no chrome at all.
  if (available.length < 2) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-slate-300 transition-colors hover:bg-white/[0.06]"
      >
        <span className="max-w-[110px] truncate">{WORKSPACES[current].label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="absolute start-0 top-full z-50 mt-1.5 w-[188px] overflow-hidden rounded-xl border border-white/[0.08] bg-ink-985/95 p-1 shadow-2xl backdrop-blur-xl"
          >
            {available.map((id) => (
              <Link
                key={id}
                href={WORKSPACES[id].home}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                  id === current
                    ? "bg-white/[0.06] text-white"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                )}
              >
                {WORKSPACES[id].label}
                {id === current && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
