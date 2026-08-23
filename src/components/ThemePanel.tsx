"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { DEFAULT_THEME, THEME_PRESETS, type ThemeAccent } from "@/lib/scholar/theme";
import { accentFromHex, accentToHex, applyTheme, cacheThemeLocally } from "@/lib/scholar/themeClient";

/**
 * Appearance / accent color.
 *
 * Every preview is applied instantly (optimistic — straight onto <html>'s
 * inline style, which is what globals.css's --accent-* rules read) and then
 * persisted to the account so it follows the student to their next device.
 * The native color input fires far too often to save on every event, so the
 * live picker debounces the network write while still repainting the app on
 * every frame.
 */
export default function ThemePanel() {
  const [accent, setAccent] = useState<ThemeAccent>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every persist() call — immediate or debounced — gets the next number here.
  // A response only gets to update the UI if it's still the most recent
  // request issued; this stops a slow-to-answer earlier request (e.g. a
  // preset click) from clobbering a faster-answering later one (e.g. a
  // color drag right after it) purely because network timing favored it.
  const requestSeq = useRef(0);

  useEffect(() => {
    fetchJson<{ theme: ThemeAccent }>("/api/settings/study").then(({ data }) => {
      if (data?.theme) {
        setAccent(data.theme);
        applyTheme(data.theme);
        cacheThemeLocally(data.theme);
      }
      setLoaded(true);
    });
  }, []);

  function preview(next: ThemeAccent) {
    setAccent(next);
    applyTheme(next);
    cacheThemeLocally(next);
  }

  function persist(next: ThemeAccent, { debounce = false }: { debounce?: boolean } = {}) {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Claim this attempt's slot up front (not inside save()) so an
    // immediate persist() right after a debounced one still invalidates it,
    // even though the debounced one hasn't fired its network call yet.
    const mySeq = ++requestSeq.current;

    const save = async () => {
      let ok = false;
      try {
        const res = await fetchJson("/api/settings/study", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }

      // A newer request has since been issued — its outcome, not this one's,
      // should decide what the status indicator shows.
      if (mySeq !== requestSeq.current) return;

      setStatus(ok ? "saved" : "error");
      setTimeout(() => setStatus((s) => (s === (ok ? "saved" : "error") ? null : s)), 1600);
    };

    if (debounce) saveTimer.current = setTimeout(save, 400);
    else save();
  }

  function choosePreset(next: ThemeAccent) {
    preview(next);
    persist(next);
  }

  function onColorInput(hex: string) {
    const next = accentFromHex(hex, accent);
    preview(next);
    persist(next, { debounce: true });
  }

  function onColorCommit(hex: string) {
    const next = accentFromHex(hex, accent);
    preview(next);
    persist(next);
  }

  const hex = accentToHex(accent);

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Appearance</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Pick any accent color — it reskins buttons, gradients, focus rings and the ambient
              background everywhere in Scholar, and follows your account to any device you sign
              into.
            </p>
          </div>
          {status && (
            <span
              className={`shrink-0 text-[11px] ${status === "error" ? "text-rose-300" : "text-emerald-300"}`}
            >
              {status === "error" ? "Couldn't save — try again" : "Saved"}
            </span>
          )}
        </div>

        {/* ── Quick presets ────────────────────────────────────────────── */}
        <div className="mt-5">
          <label className="label">Quick presets</label>
          <div className="mt-2 flex flex-wrap gap-3">
            {THEME_PRESETS.map((preset) => {
              const active =
                Math.round(accent.h) === preset.accent.h &&
                Math.round(accent.h2) === preset.accent.h2 &&
                Math.round(accent.s) === preset.accent.s &&
                Math.round(accent.l) === preset.accent.l;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => choosePreset(preset.accent)}
                  className="group flex flex-col items-center gap-1.5"
                  title={preset.label}
                  aria-pressed={active}
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full border-2 shadow-lift transition-transform duration-200 group-hover:scale-110 ${
                      active ? "border-white" : "border-white/15"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, hsl(${preset.accent.h} ${preset.accent.s}% ${preset.accent.l}%), hsl(${preset.accent.h2} ${preset.accent.s}% ${preset.accent.l}%))`,
                    }}
                  >
                    {active && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[10.5px] leading-tight text-slate-500 group-hover:text-slate-300">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Custom color ─────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={hex}
              onChange={(e) => onColorInput(e.target.value)}
              onBlur={(e) => onColorCommit(e.target.value)}
              className="h-11 w-11 cursor-pointer rounded-lg border border-white/[0.12] bg-transparent p-0"
              aria-label="Custom accent color"
            />
            <div>
              <p className="text-[13px] font-medium text-slate-200">Custom color</p>
              <p className="text-[11px] text-slate-500">Any hue — drag to preview, it saves automatically.</p>
            </div>
          </div>

          <div className="ml-auto font-mono text-[11px] uppercase text-slate-500">{loaded ? hex : "…"}</div>
        </div>

        {/* ── Live preview strip ───────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary px-4 py-2 text-xs">
            Preview button
          </button>
          <span className="gradient-text text-sm font-semibold">Gradient text preview</span>
        </div>
      </section>
    </div>
  );
}
