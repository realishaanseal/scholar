import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          985: "#08090d",
          950: "#0b0c11",
          900: "#101118",
          850: "#14161d",
          800: "#191b23",
          700: "#242732",
          600: "#343846",
        },
        // Static fallback shades approximating the royal-blue / indigo default
        // accent theme (see globals.css's --accent-* custom properties for
        // the actual, user-overridable brand color). These are used only by
        // the handful of `vx-*` utility classes that Tailwind resolves at
        // build time (e.g. `border-vx-500/70`, `accent-vx-500`) — the live,
        // per-user accent color is driven by CSS vars everywhere else.
        vx: {
          50: "#eef3ff",
          200: "#c8d6fe",
          300: "#a3bcfb",
          400: "#7699f6",
          500: "#5478ee",
          600: "#3f5cd4",
          700: "#3548a5",
        },
        // Kept as a selectable preset (see THEME_PRESETS in lib/scholar/theme.ts)
        // for anyone who preferred the old purple/violet brand — no longer
        // the default and no longer referenced by any base component style.
        iris: { 400: "#b07dff", 500: "#9455f5", 600: "#7c3aed" },
        aqua: { 400: "#4fd6e8", 500: "#22b8d0" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.5rem" },
      boxShadow: {
        glow: "0 0 0 1px rgba(84,120,238,0.14), 0 10px 30px -14px rgba(0,0,0,0.7)",
        lift: "0 16px 44px -22px rgba(0,0,0,0.8)",
        "inner-top": "inset 0 1px 0 0 rgba(255,255,255,0.05)",
      },
      keyframes: {
        drift: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(4%,-3%,0) scale(1.08)" },
          "66%": { transform: "translate3d(-3%,4%,0) scale(0.95)" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%) skewX(-18deg)" },
          "100%": { transform: "translateX(220%) skewX(-18deg)" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.985)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "60%": { transform: "scale(1.015)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        borderSpin: { "0%": { "--angle": "0deg" }, "100%": { "--angle": "360deg" } },
        ripple: {
          "0%": { transform: "scale(0.85)", opacity: "0.55" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
        shimmer: { "0%": { backgroundPosition: "200% 0" }, "100%": { backgroundPosition: "-200% 0" } },
        breathe: {
          "0%,100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.03)" },
        },
      },
      animation: {
        drift: "drift 26s ease-in-out infinite",
        "drift-slow": "drift 40s ease-in-out infinite reverse",
        sheen: "sheen 1.1s ease-out",
        riseIn: "riseIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
        fadeIn: "fadeIn 0.6s ease-out both",
        popIn: "popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        ripple: "ripple 1.6s ease-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        breathe: "breathe 4s ease-in-out infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
