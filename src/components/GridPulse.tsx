"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A living layer over the ambient grid: individual cells warm up and fade
 * out again, in a slow wave that drifts across the screen.
 *
 * Drawn on one canvas rather than as DOM nodes — a few hundred animated
 * elements would cost a style recalc per frame, while this is a single
 * composited layer. It sits behind everything, ignores pointer events, and
 * is purely decorative.
 *
 * Three things keep it from being a battery tax:
 *   - it renders nothing at all under `prefers-reduced-motion`
 *   - the loop stops while the tab is hidden
 *   - only SPARKS cells are alive at any moment, not the whole grid
 *
 * The cell size and the mask deliberately match `.grid-veil` in globals.css
 * so the pulses land exactly on the static grid's squares instead of
 * floating over them on their own lattice.
 */

/** Must match `.grid-veil`'s background-size. */
const CELL = 64;
/** Live cells at any one time. */
const SPARKS = 18;
/** Seconds a cell takes to rise and fall. */
const LIFE_MIN = 2.2;
const LIFE_MAX = 5.0;
/** Peak alpha of a lit cell. Low on purpose — this should register as the
 *  room breathing, not as a light show competing with the content. */
const PEAK = 0.1;
/** Seconds for the activity wave to cross the viewport once. */
const SWEEP_PERIOD = 26;

type Spark = { col: number; row: number; born: number; life: number };

export default function GridPulse() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let hue = 224;
    let sat = 70;
    let light = 62;

    function readAccent() {
      const cs = getComputedStyle(document.documentElement);
      const n = (name: string, fallback: number) => {
        const v = parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      hue = n("--accent-h", 224);
      sat = n("--accent-s", 70);
      light = n("--accent-l", 62);
    }

    /* Measured from the element's own box rather than window.innerWidth: a
       canvas that mounts while its container is still 0x0 (a hidden pane, a
       tab restored in the background) would otherwise size to nothing and
       stay blank until a window resize happened to fire. The ResizeObserver
       below then corrects it the moment it does get a size. */
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas!.getBoundingClientRect();
      width = Math.round(rect.width) || window.innerWidth;
      height = Math.round(rect.height) || window.innerHeight;
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(height / CELL);
      if (width <= 0 || height <= 0) return;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* Spawn biased toward the sweep's current column, so the activity reads
       as one slow wave crossing rather than uncorrelated twinkling. */
    function spawn(now: number): Spark {
      const phase = ((now / 1000) % SWEEP_PERIOD) / SWEEP_PERIOD;
      const centre = phase * (cols + 8) - 4;
      const spread = cols * 0.22;
      const col = Math.round(centre + (Math.random() - 0.5) * 2 * spread);
      return {
        col: Math.max(0, Math.min(cols - 1, col)),
        row: Math.floor(Math.random() * rows),
        born: now,
        life: (LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN)) * 1000,
      };
    }

    let sparks: Spark[] = [];

    function seed(now: number) {
      if (cols < 1 || rows < 1) {
        sparks = [];
        return;
      }
      sparks = Array.from({ length: SPARKS }, () => {
        const s = spawn(now);
        // Stagger the first generation through their lifetimes so they don't
        // all bloom together on the first frame.
        s.born = now - Math.random() * s.life;
        return s;
      });
    }

    function frame(now: number) {
      if (stopped) return;
      ctx!.clearRect(0, 0, width, height);

      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        const t = (now - s.born) / s.life;
        if (t >= 1) {
          sparks[i] = spawn(now);
          continue;
        }
        // Rise and fall — sin gives a soft in and out with no seam.
        const alpha = Math.sin(t * Math.PI) * PEAK;
        if (alpha <= 0.002) continue;

        const x = s.col * CELL;
        const y = s.row * CELL;
        ctx!.fillStyle =
          "hsl(" + hue + " " + sat + "% " + Math.min(80, light + 12) + "% / " + alpha.toFixed(3) + ")";
        ctx!.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }

      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (!stopped) return;
      stopped = false;
      seed(performance.now());
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    readAccent();
    resize();
    seed(performance.now());
    raf = requestAnimationFrame(frame);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        seed(performance.now());
      }, 150);
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      clearTimeout(resizeTimer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  if (reduce) return null;

  return <canvas ref={ref} className="grid-pulse" aria-hidden />;
}
