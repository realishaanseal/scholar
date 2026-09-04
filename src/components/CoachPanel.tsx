"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What should I study tonight?",
  "Can I finish everything before Friday?",
  "Which assignment should I do first?",
  "Am I falling behind?",
];

/**
 * Study coach. Answers strictly from the student's own Scholar data — the
 * server builds the briefing, so the model has nothing else to draw on.
 */
export default function CoachPanel({ onClose }: { onClose?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProvider, setNeedsProvider] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll only this panel's own message list, by setting its scrollTop
    // directly — not element.scrollIntoView(), which walks up through every
    // scrollable ancestor (including the page itself) and can drag the whole
    // dashboard's scroll position along with it. This can only ever move the
    // chat's own internal scrollbar, never the page.
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    setError(null);

    const { ok, data, error } = await fetchJson<{
      answer: string; referencedTasks: string[]; needsProvider?: boolean;
    }>("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        nowISO: new Date().toISOString(),
        // Only the last few turns travel — enough for follow-ups without
        // growing the prompt without bound.
        history: turns.slice(-6),
      }),
    });

    setBusy(false);

    if (!ok || !data) {
      setError(error ?? "The coach couldn't answer just now.");
      if ((data as any)?.needsProvider || /needs an AI provider/i.test(error ?? "")) {
        setNeedsProvider(true);
      }
      return;
    }

    setTurns((prev) => [...prev, { role: "assistant", content: data.answer }]);
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="card flex h-[520px] flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">Study coach</h2>
          <p className="text-[11px] text-slate-500">Knows your tasks, deadlines and pace</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Close">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {turns.length === 0 && (
          <div className="pt-2">
            <p className="text-[13px] leading-relaxed text-slate-400">
              Ask about your workload — deadlines, time, and how long your work takes.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
      type="button"
      key={s}
                  onClick={() => ask(s)}
                  className="chip-btn border border-white/[0.08] bg-white/[0.025] text-[11px] text-slate-400
                             hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10, x: t.role === "user" ? 12 : -12 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            transition={SPRING}
            className={t.role === "user" ? "flex justify-end" : ""}
          >
            <div
              className={
                t.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] text-white"
                  : "max-w-[92%] text-[13px] leading-relaxed text-slate-300"
              }
              style={t.role === "user" ? { background: "var(--grad-brand)" } : undefined}
            >
              {t.content.split("\n").filter(Boolean).map((line, j) => (
                <p key={j} className={j > 0 ? "mt-2" : ""}>{line}</p>
              ))}
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-[12px] text-slate-500"
            >
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-slate-500"
                    animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                  />
                ))}
              </span>
              Thinking
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-300">
            {error}
            {needsProvider && (
              <Link href="/settings" className="ml-1 underline underline-offset-2 hover:text-red-200">
                Open settings
              </Link>
            )}
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
      >
        <input
          className="input py-2.5 text-[13px]"
          placeholder="Ask about your workload…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          aria-label="Send"
          className="btn-primary shrink-0 px-4 py-2.5"
          disabled={busy || input.trim().length < 2}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </motion.section>
  );
}
