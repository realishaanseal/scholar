"use client";

/**
 * Ambient page backdrop: three aurora fields that both drift on their own
 * slow loops and parallax toward the pointer (each layer at a different
 * depth), over a masked grid, a vignette and a film-grain veil.
 *
 * Purely decorative — fixed, behind everything (`z-index: -3`), pointer-events
 * none. Every blob is tinted from the same `--accent-h` / `--accent-h-2`
 * custom properties the rest of the theme reads, so it re-tints live with the
 * user's accent. Under `prefers-reduced-motion` it renders completely static
 * (the CSS `.animate-drift` keyframes are dropped and no pointer tracking runs).
 */

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

const DRIFT: Record<"a" | "b" | "c", any> = {
  a: {
    animate: { x: ["0%", "6%", "-3%", "0%"], y: ["0%", "-4%", "5%", "0%"], scale: [1, 1.08, 0.96, 1] },
    transition: { duration: 34, ease: "easeInOut", repeat: Infinity },
  },
  b: {
    animate: { x: ["0%", "-5%", "4%", "0%"], y: ["0%", "5%", "-3%", "0%"], scale: [1, 0.94, 1.06, 1] },
    transition: { duration: 44, ease: "easeInOut", repeat: Infinity, delay: -8 },
  },
  c: {
    animate: { x: ["0%", "4%", "-6%", "0%"], y: ["0%", "-6%", "3%", "0%"], scale: [1, 1.1, 0.92, 1] },
    transition: { duration: 52, ease: "easeInOut", repeat: Infinity, delay: -16 },
  },
};

export default function Backdrop() {
  const reduce = useReducedMotion();

  // Normalised pointer position, -0.5 … 0.5, springed for weight.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 20, mass: 1.4 });
  const sy = useSpring(my, { stiffness: 40, damping: 20, mass: 1.4 });

  // Per-layer parallax depth (px of travel across the full viewport).
  const near = { x: useTransform(sx, [-0.5, 0.5], [46, -46]), y: useTransform(sy, [-0.5, 0.5], [40, -40]) };
  const mid = { x: useTransform(sx, [-0.5, 0.5], [26, -26]), y: useTransform(sy, [-0.5, 0.5], [22, -22]) };
  const far = { x: useTransform(sx, [-0.5, 0.5], [-14, 14]), y: useTransform(sy, [-0.5, 0.5], [-12, 12]) };

  useEffect(() => {
    if (reduce) return;
    function onMove(e: PointerEvent) {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, mx, my]);

  return (
    <>
      <div className="aurora-field" aria-hidden>
        <motion.div
          className="aurora-blob"
          style={{
            top: "-10%", left: "-6%", width: "62vw", height: "62vw",
            x: reduce ? 0 : near.x, y: reduce ? 0 : near.y,
            background:
              "radial-gradient(circle at 30% 30%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.55), transparent 60%)",
          }}
          {...(reduce ? {} : DRIFT.a)}
        />
        <motion.div
          className="aurora-blob"
          style={{
            top: "-4%", right: "-10%", width: "56vw", height: "56vw",
            x: reduce ? 0 : mid.x, y: reduce ? 0 : mid.y,
            background:
              "radial-gradient(circle at 60% 40%, hsl(var(--accent-h-2) var(--accent-s) var(--accent-l) / 0.45), transparent 60%)",
          }}
          {...(reduce ? {} : DRIFT.b)}
        />
        <motion.div
          className="aurora-blob"
          style={{
            bottom: "-18%", left: "20%", width: "64vw", height: "52vw",
            x: reduce ? 0 : far.x, y: reduce ? 0 : far.y,
            background:
              "radial-gradient(circle at 50% 50%, hsl(calc(var(--accent-h) - 18) var(--accent-s) calc(var(--accent-l) - 6%) / 0.3), transparent 62%)",
          }}
          {...(reduce ? {} : DRIFT.c)}
        />
      </div>
      <div className="grid-veil" aria-hidden />
      <div className="vignette-veil" aria-hidden />
      <div className="grain-veil" aria-hidden />
    </>
  );
}
