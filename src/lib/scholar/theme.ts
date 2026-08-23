/**
 * The theme catalog. Safe to import from client components — mirrors
 * lib/ai/catalog.ts's split (catalog vs. the server-only store that reads
 * and writes it): no database access, no server-only code.
 *
 * The whole app's accent is driven by two HSL hues (a base and a second,
 * slightly-rotated hue for the brand gradient's far stop — see
 * `--accent-h` / `--accent-h-2` in globals.css) plus one shared saturation
 * and one shared lightness. Storing four numbers instead of a hex string is
 * what makes "pick literally any color" cheap on the CSS side: every
 * gradient, glow and focus ring in globals.css derives from these via
 * `hsl(...)`, so changing four numbers reskins the entire UI.
 */

export type ThemeAccent = {
  h: number; // 0-360
  h2: number; // 0-360, second stop for two-tone gradients
  s: number; // 0-100 (%)
  l: number; // 0-100 (%)
};

/** The new default — a cyan-to-blue sweep, replacing the old purple/violet brand. */
export const DEFAULT_THEME: ThemeAccent = { h: 195, h2: 222, s: 85, l: 55 };

export type ThemePreset = { id: string; label: string; accent: ThemeAccent };

/**
 * Curated quick picks shown as swatches in Settings, alongside the free-form
 * color input. Cyan/Blue is first and is what a fresh account gets by
 * default. The old purple brand is kept as an ordinary preset (not the
 * default) for anyone who liked it.
 */
export const THEME_PRESETS: ThemePreset[] = [
  { id: "cyan-blue", label: "Cyan / Blue", accent: { h: 195, h2: 222, s: 85, l: 55 } },
  { id: "emerald-teal", label: "Emerald / Teal", accent: { h: 160, h2: 185, s: 72, l: 48 } },
  { id: "rose-pink", label: "Rose / Pink", accent: { h: 340, h2: 320, s: 82, l: 60 } },
  { id: "amber-orange", label: "Amber / Orange", accent: { h: 32, h2: 18, s: 92, l: 55 } },
  { id: "violet-purple", label: "Violet / Purple", accent: { h: 255, h2: 275, s: 82, l: 62 } },
  { id: "slate-mono", label: "Slate / Mono", accent: { h: 220, h2: 220, s: 14, l: 62 } },
];

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Guards against bad/garbage input before it ever reaches the database. */
export function sanitizeAccent(input: Partial<ThemeAccent> | null | undefined): ThemeAccent {
  if (!input) return DEFAULT_THEME;
  return {
    h: ((clamp(input.h ?? DEFAULT_THEME.h, -3600, 3600) % 360) + 360) % 360,
    h2: ((clamp(input.h2 ?? DEFAULT_THEME.h2, -3600, 3600) % 360) + 360) % 360,
    s: clamp(input.s ?? DEFAULT_THEME.s, 0, 100),
    l: clamp(input.l ?? DEFAULT_THEME.l, 8, 92),
  };
}

/** `"195,85,55,222"` (h,s,l,h2) — a single TEXT column, no JSON parsing needed. */
export function encodeAccent(a: ThemeAccent): string {
  return `${a.h},${a.s},${a.l},${a.h2}`;
}

export function decodeAccent(raw: string | null | undefined): ThemeAccent | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [h, s, l, h2] = parts;
  return sanitizeAccent({ h, s, l, h2 });
}
