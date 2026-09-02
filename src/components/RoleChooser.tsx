"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { ACCOUNT_INTENTS, INTENT_COPY } from "@/lib/accountIntent";

/**
 * The first question: which side of the school are you on.
 *
 * Asked before credentials rather than after, because everything downstream
 * reads differently — what the form says, where you land, and what happens
 * next if you are a teacher whose school has not added you yet. Asking after
 * sign-in would mean showing a student's dashboard to a head of year for a
 * second first.
 */
export default function RoleChooser({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="space-y-2.5">
      {ACCOUNT_INTENTS.map((intent, i) => {
        const copy = INTENT_COPY[intent];
        return (
          <motion.div
            key={intent}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.05 + i * 0.06 }}
          >
            <Link
              href={`/${mode}?as=${intent}`}
              className="group flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-slate-400 transition-colors group-hover:text-vx-300">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d={copy.icon}
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-slate-100">
                  {copy.label}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                  {copy.blurb}
                </span>
              </span>

              <svg
                width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden
                className="shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400"
              >
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
