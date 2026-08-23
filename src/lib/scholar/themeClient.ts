"use client";

import type { ThemeAccent } from "./theme";

/**
 * Client-only color math for the theme picker. Deliberately hand-rolled —
 * converting a hex string from `<input type="color">` into the HSL numbers
 * the CSS custom properties want is a dozen lines, not a dependency.
 */

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h *= 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * When a user picks a single color, we still want the two-hue gradient look
 * the rest of the theme relies on for depth — so the second stop is derived
 * as a small, fixed rotation around the wheel from the picked hue rather
 * than asking for two separate colors.
 */
const SECOND_HUE_OFFSET = 27;

export function accentFromHex(hex: string, base?: Partial<ThemeAccent>): ThemeAccent {
  const { h, s, l } = hexToHsl(hex);
  return {
    h,
    h2: (h + SECOND_HUE_OFFSET) % 360,
    s: base?.s ?? Math.max(s, 55),
    l: base?.l ?? Math.min(Math.max(l, 40), 65),
  };
}

export function accentToHex(accent: ThemeAccent): string {
  return hslToHex(accent.h, accent.s, accent.l);
}

/** Applies the theme live by setting inline custom properties on <html>. */
export function applyTheme(accent: ThemeAccent) {
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(accent.h));
  root.style.setProperty("--accent-h-2", String(accent.h2));
  root.style.setProperty("--accent-s", `${accent.s}%`);
  root.style.setProperty("--accent-l", `${accent.l}%`);
}

const STORAGE_KEY = "vx-theme-accent";

/** Per-browser cache only — used to paint the right theme before the network
 *  round-trip to load the account's saved theme resolves, avoiding a flash
 *  of the default on repeat visits. The database row remains the source of
 *  truth and is what actually syncs the theme across devices. */
export function cacheThemeLocally(accent: ThemeAccent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accent));
  } catch {
    // Private browsing / storage disabled — live preview still works, it just
    // won't survive a reload until the server round-trip completes.
  }
}

export function readCachedTheme(): ThemeAccent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.h === "number" &&
      typeof parsed?.h2 === "number" &&
      typeof parsed?.s === "number" &&
      typeof parsed?.l === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
