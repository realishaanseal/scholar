"use client";

/**
 * Shared Motion primitives.
 *
 * The whole app's animation vocabulary lives here so individual components
 * stay declarative: `<Reveal>`, `<Stagger>/<StaggerItem>`, `<TiltCard>`,
 * `<Magnetic>`, `<AnimatedCounter>`. Every one of them collapses to a plain
 * static element under `prefers-reduced-motion` (via <MotionProvider>'s
 * `reducedMotion="user"`), and every transition is transform/opacity/filter
 * only, so nothing here triggers layout on the main thread.
 *
 * Timing constants are exported too — reach for EASE_OUT / SPRING / SPRING_SOFT
 * rather than hand-rolling a cubic-bezier per component.
 */

import {
  MotionConfig,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  animate,
  type Variants,
  type Transition,
  type MotionProps,
} from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/* ── Timing ─────────────────────────────────────────────────────────────── */

/** Matches the app's existing `ease-smooth` (globals.css). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Matches the app's existing `ease-spring` — a gentle overshoot. */
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

export const SPRING: Transition = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 };
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 170, damping: 26, mass: 1 };
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 520, damping: 32 };

/* ── Variants ───────────────────────────────────────────────────────────── */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE_OUT } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE_OUT } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRING_SOFT },
};

export const staggerParent = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/* ── Provider ───────────────────────────────────────────────────────────── */

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.5, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}

/* ── Reveal ─────────────────────────────────────────────────────────────────
   Drop-in replacement for the `.animate-riseIn` / `.animate-fadeIn` classes.
   Animates once when it scrolls into view (or immediately, if already in). */

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** vertical travel, px. 0 → pure fade. */
  y?: number;
  delay?: number;
  duration?: number;
  once?: boolean;
  /** fraction of the element visible before it fires */
  amount?: number | "some" | "all";
  blur?: boolean;
};

export function Reveal({
  children,
  as = "div",
  className,
  style,
  y = 16,
  delay = 0,
  duration = 0.55,
  once = true,
  amount = 0.2,
  blur = true,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once, amount });
  const reduce = useReducedMotion();
  const MotionTag = motion(as as any);

  return (
    <MotionTag
      ref={ref as any}
      className={className}
      style={style}
      initial={reduce ? undefined : "hidden"}
      animate={inView ? "show" : "hidden"}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : y, filter: blur && !reduce ? "blur(6px)" : "blur(0px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration, ease: EASE_OUT, delay },
        },
      }}
    >
      {children}
    </MotionTag>
  );
}

/* ── Stagger ────────────────────────────────────────────────────────────────
   Cascading entrance. Replaces the hand-managed `--i` / `.stagger` pattern. */

const StaggerCtx = createContext(false);

export function Stagger({
  children,
  className,
  style,
  as = "div",
  stagger = 0.06,
  delay = 0,
  once = true,
  amount = 0.15,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  stagger?: number;
  delay?: number;
  once?: boolean;
  amount?: number | "some" | "all";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once, amount });
  const MotionTag = motion(as as any);

  return (
    <StaggerCtx.Provider value={true}>
      <MotionTag
        ref={ref as any}
        className={className}
        style={style}
        initial="hidden"
        animate={inView ? "show" : "hidden"}
        variants={staggerParent(stagger, delay)}
      >
        {children}
      </MotionTag>
    </StaggerCtx.Provider>
  );
}

export function StaggerItem({
  children,
  className,
  style,
  as = "div",
  y = 14,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  y?: number;
} & MotionProps) {
  const MotionTag = motion(as as any);
  return (
    <MotionTag
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y, filter: "blur(4px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: EASE_OUT } },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/* ── TiltCard ───────────────────────────────────────────────────────────────
   Pointer-tracked 3D tilt + a soft spotlight that follows the cursor. Used on
   the hero product shot and the headline dashboard cards for real depth. */

export function TiltCard({
  children,
  className,
  style,
  max = 8,
  scale = 1.012,
  spotlight = true,
  glareColor = "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 12%) / 0.14)",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  max?: number;
  scale?: number;
  spotlight?: boolean;
  glareColor?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), SPRING_SOFT);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), SPRING_SOFT);
  const sx = useSpring(px, SPRING_SOFT);
  const sy = useSpring(py, SPRING_SOFT);

  const spotlightBg = useTransform(
    [sx, sy],
    ([x, y]: number[]) =>
      `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${glareColor}, transparent 55%)`,
  );

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{
        ...style,
        rotateX: rx,
        rotateY: ry,
        transformPerspective: 1100,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ scale }}
      transition={SPRING_SOFT}
    >
      {children}
      {spotlight && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ background: spotlightBg as any, mixBlendMode: "screen" }}
        />
      )}
    </motion.div>
  );
}

/* ── Magnetic ───────────────────────────────────────────────────────────────
   Nudges its child toward the cursor. Wrap a primary CTA. */

export function Magnetic({
  children,
  className,
  strength = 0.32,
  radius = 90,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), SPRING_SNAPPY);
  const y = useSpring(useMotionValue(0), SPRING_SNAPPY);

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    const pull = Math.max(0, 1 - dist / (radius + Math.max(r.width, r.height) / 2));
    x.set(dx * strength * pull);
    y.set(dy * strength * pull);
  }

  if (reduce) return <span className={className}>{children}</span>;

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ x, y, display: "inline-flex" }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/* ── AnimatedCounter ────────────────────────────────────────────────────────
   Spring-eased count to `value`. Replaces AnimatedNumber's rAF loop. */

export function AnimatedCounter({
  value,
  className,
  format = (n) => String(Math.round(n)),
  duration = 0.9,
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (reduce || prev.current === value) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}

/* ── Re-exports so consumers only import from one place ─────────────────── */
export { motion, AnimatePresence, useReducedMotion, useInView, useSpring, useMotionValue, useTransform, animate };
export type { Variants, Transition, MotionProps };
