"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import Logo from "./Logo";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[440px]">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          <Link href="/" className="mb-8 flex items-center justify-center gap-3">
            <motion.span whileHover={{ rotate: -8, scale: 1.06 }} transition={SPRING} className="block">
              <Logo size={38} />
            </motion.span>
            <div className="text-left leading-tight">
              <div className="text-sm font-semibold tracking-tight text-white">
                Varaxis <span className="text-vx-300">Scholar</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">by Varaxis</div>
            </div>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.08 }}
          className="card p-7 xl:p-8"
        >
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{subtitle}</p>
          )}
          <div className="mt-6">{children}</div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.35 }}
          className="mt-6 text-center text-sm text-slate-500"
        >
          {footer}
        </motion.p>
      </div>
    </main>
  );
}
