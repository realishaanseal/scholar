"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import type { ProviderInfo } from "@/lib/ai/catalog";

export type ModelOption = { id: string; label: string; score: number; note?: string };

export type ModelListState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; models: ModelOption[]; suggested: string | null }
  | { state: "error"; error: string };

/**
 * "Auto" is the default and the right answer for almost everyone: the server
 * picks a current, cheap, fast model. The list is only there for people who
 * want to override it — and it's the provider's real list, not a guess.
 */
export default function ModelPicker({
  info,
  value,
  onChange,
  list,
  onRefresh,
  canDetect,
}: {
  info: ProviderInfo;
  /** null = Auto */
  value: string | null;
  onChange: (model: string | null) => void;
  list: ModelListState;
  onRefresh: () => void;
  canDetect: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const models: ModelOption[] = list.state === "ready" ? list.models : [];
  const suggested = list.state === "ready" ? list.suggested : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? models.filter((m) => m.id.toLowerCase().includes(q)) : models;
    return base.slice(0, 60);
  }, [models, query]);

  const autoLabel = suggested ?? info.defaultModel;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="label mb-0">Model</label>
        {canDetect && (
          <button
      type="button"
      onClick={onRefresh}
            disabled={list.state === "loading"}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 transition-colors hover:text-vx-300 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 ${list.state === "loading" ? "animate-spin" : ""}`}
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
            </svg>
            {list.state === "loading" ? "Detecting…" : "Detect models"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Auto */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
            value === null
              ? "border-vx-500/60 bg-vx-500/[0.12]"
              : "border-white/[0.09] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${value === null ? "text-vx-200" : "text-slate-300"}`}>
              Auto
            </span>
            <span className="chip border border-emerald-500/25 bg-emerald-500/[0.08] text-[10px] text-emerald-300">
              recommended
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
            {list.state === "loading" ? "detecting…" : autoLabel}
          </div>
        </button>

        {/* Manual */}
        <div ref={boxRef} className="relative flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
              value !== null
                ? "border-vx-500/60 bg-vx-500/[0.12]"
                : "border-white/[0.09] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-medium ${value !== null ? "text-vx-200" : "text-slate-300"}`}>
                Choose myself
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
              {value ?? "not set"}
            </div>
          </button>

          <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="absolute left-0 right-0 top-full z-20 mt-2 origin-top overflow-hidden rounded-xl border border-white/[0.10] bg-ink-900/95 shadow-lift backdrop-blur-xl"
            >
              <div className="border-b border-white/[0.07] p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={models.length ? "Filter models…" : "Type a model name…"}
                  className="input py-2 text-[13px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && query.trim()) {
                      onChange(query.trim());
                      setOpen(false);
                    }
                  }}
                />
              </div>

              <div className="max-h-[260px] overflow-y-auto p-1.5">
                {list.state === "loading" && (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">Asking {info.label}…</p>
                )}

                {list.state === "error" && (
                  <div className="px-3 py-3">
                    <p className="text-xs leading-relaxed text-amber-300/90">{list.error}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      You can still type a model name above and press Enter.
                    </p>
                  </div>
                )}

                {(list.state === "idle" || (list.state === "ready" && models.length === 0)) && (
                  <div className="px-3 py-3">
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      {canDetect
                        ? "Hit “Detect models” to load the live list, or type a name and press Enter."
                        : "Type a model name and press Enter."}
                    </p>
                    {info.modelSuggestions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {info.modelSuggestions.map((m) => (
                          <button
      type="button"
      key={m}
                            onClick={() => { onChange(m); setOpen(false); }}
                            className="chip-btn border border-white/[0.08] bg-white/[0.03] text-[11px] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filtered.map((m) => (
                  <button
      type="button"
      key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                      value === m.id ? "bg-vx-500/[0.16]" : "hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className={`truncate font-mono text-[12px] ${value === m.id ? "text-vx-200" : "text-slate-300"}`}>
                      {m.id}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {m.note === "free" && (
                        <span className="chip border border-emerald-500/25 bg-emerald-500/[0.08] text-[10px] text-emerald-300">
                          free
                        </span>
                      )}
                      {m.id === suggested && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-600">best</span>
                      )}
                    </span>
                  </button>
                ))}

                {list.state === "ready" && models.length > filtered.length && (
                  <p className="px-3 py-2 text-center text-[11px] text-slate-600">
                    {models.length - filtered.length} more — keep typing to filter
                  </p>
                )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {list.state === "error" && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">{list.error}</p>
      )}
      {list.state === "ready" && (
        <p className="mt-2 text-[11px] text-slate-600">
          {list.models.length} model{list.models.length === 1 ? "" : "s"} available on this key.
        </p>
      )}
    </div>
  );
}
