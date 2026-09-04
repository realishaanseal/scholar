"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { PROVIDER_MAP } from "@/lib/ai/catalog";
import { fetchJson } from "@/lib/fetchJson";

type AISettings = {
  provider: string;
  hasKey: boolean;
  usingEnvFallback: boolean;
};

/**
 * The offline fallback is a safety net, not a feature. If it's what's running,
 * say so before the student captures work and wonders why nothing was cleaned up —
 * finding out afterwards, on every single card, is a worse experience.
 */
export default function AISetupBanner() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await fetchJson<AISettings>("/api/settings/ai");
      if (!data) return;
      const info = PROVIDER_MAP[data.provider];
      setNeedsSetup(data.provider === "heuristic" || (Boolean(info?.needsKey) && !data.hasKey));
    })();
  }, []);

  return (
    <AnimatePresence>
      {needsSetup && !dismissed && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -8 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -8, marginBottom: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          <div className="card relative overflow-hidden border-amber-500/25 p-5"
            style={{ boxShadow: "0 18px 50px -20px rgba(0,0,0,0.85), inset 0 0 80px -40px rgba(245,158,11,0.22)" }}>
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/[0.10]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-300" fill="currentColor">
            <path d="M12 2l1.9 5.5L19 9l-5.1 1.5L12 16l-1.9-5.5L5 9l5.1-1.5z" />
          </svg>
        </span>

        {/* min-w-[14rem], not min-w-0: with flex-wrap, a zero minimum means the
            column never wraps to its own row — it just shrinks to a sliver and
            the copy breaks one word per line. Giving it a real minimum makes
            the actions wrap below instead once space runs out. */}
        <div className="min-w-[14rem] flex-1">
          <h2 className="text-sm font-semibold text-white">The AI isn&apos;t connected yet</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Scholar is using its offline parser. Connecting a provider takes about a minute.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/settings" className="btn-primary px-4">
            Connect an AI
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <button
      type="button"
      onClick={() => setDismissed(true)}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
            aria-label="Dismiss"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
