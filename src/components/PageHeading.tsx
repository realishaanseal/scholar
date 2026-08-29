"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";

/**
 * Shared page title block for the top-level app pages (Timetable, Import,
 * Calendar, Insights, Groups, Settings, Extension). The gradient heading
 * clips in and the subtitle follows a beat later, on top of the route
 * cross-fade the AppShell already runs.
 */
export default function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <motion.h1
        className="text-2xl font-semibold tracking-tight"
        initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <span className="gradient-text">{title}</span>
      </motion.h1>
      <motion.p
        className="mt-1.5 text-sm text-slate-400"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 }}
      >
        {subtitle}
      </motion.p>
    </div>
  );
}
