"use client";

import { useEffect } from "react";
import { fetchJson } from "@/lib/fetchJson";
import type { ThemeAccent } from "@/lib/scholar/theme";
import { applyTheme, cacheThemeLocally, readCachedTheme } from "@/lib/scholar/themeClient";

/**
 * Applies the signed-in user's saved accent color as early as a client
 * component can run.
 *
 * Two steps, in order:
 *  1. Synchronously apply whatever this browser last cached locally (if
 *     anything) — this is what keeps a *repeat* visit on the same device
 *     from flashing the default theme before the network request below
 *     resolves. It is a cache only; a different browser or a cleared one
 *     has nothing to read here and briefly shows the default, which the
 *     brief in this task explicitly accepts as fine.
 *  2. Fetch the account's saved theme from the database — the actual
 *     cross-device source of truth — and apply + re-cache it. This is what
 *     makes the theme follow the student to a new browser or device at all.
 *
 * Rendered once near the root of each authenticated page (Dashboard,
 * Settings) rather than in the root layout, since the root layout also
 * covers signed-out pages (login/signup/landing) that have no theme to load.
 */
export default function ThemeLoader() {
  useEffect(() => {
    const cached = readCachedTheme();
    if (cached) applyTheme(cached);

    let cancelled = false;
    fetchJson<{ theme: ThemeAccent }>("/api/settings/study").then(({ data }) => {
      if (cancelled || !data?.theme) return;
      applyTheme(data.theme);
      cacheThemeLocally(data.theme);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
