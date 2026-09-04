"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";

/**
 * Shared page title block for the top-level app pages.
 *
 * The subtitle is optional and exists for a count or a state — "12 people",
 * "nothing waiting on you". A page whose subtitle would only rephrase its
 * title passes none.
 */
export default function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
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
      {subtitle && (
        <motion.p
          className="mt-1.5 text-sm text-slate-400"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
