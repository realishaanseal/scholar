"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

/**
 * Cinematic title sequence shown over the landing page for signed-out
 * visitors. By design it has no persistence (no sessionStorage / cookie) —
 * the brief is for it to replay on every refresh while signed out, and there
 * is no skip control.
 *
 * The animation is deliberately restrained: a small set of elements, every
 * one moved with transform + opacity only (no per-frame filter or
 * background-position work), choreographed so each beat overlaps the next
 * rather than stopping and starting. Spring physics on the "arrival" moments
 * (mark, letters) give it weight; smooth expo curves carry the fades.
 *
 * Beats (ms from mount):
 *   0.00  the frame lifts from black — a soft accent glow and a receding
 *         grid ease in, a few motes drift upward
 *   0.28  the mark springs up to size; a ring pushes out; a light bar
 *         sweeps once behind it
 *   1.15  the wordmark rises letter by letter from behind a clip line
 *   1.55  a sheen passes across the settled type
 *   1.95  a hairline rule draws from the centre
 *   2.30  the tagline eases up, its tracking closing
 *   4.10  push-through — the group scales up and fades, the glow blooms out,
 *         the grid slides past, and the finished landing page rises into the
 *         same space underneath (HomeIntroGate holds its entrance to here)
 *   5.05  unmount
 *
 * Under `prefers-reduced-motion` the finished card is shown still, held for a
 * beat, then cross-faded out.
 */

const EXPO = [0.16, 1, 0.3, 1] as const;
const EXPO_IN_OUT = [0.65, 0, 0.35, 1] as const;

const WORDS = ["Varaxis", "Scholar"];
const TAGLINE = "Every deadline, one clear picture.";

const T_WORD = 1150;
const T_SHEEN = 1550;
const T_RULE = 1950;
const T_TAG = 2300;
const T_EXIT = 4100;
const EXIT_MS = 950;

const RT_EXIT = 1800;

/** Deterministic positions — Math.random() would desync server vs client. */
const MOTES = [
  { x: "14%", y: "82%", s: 2.5, d: 8.5, delay: 0.2 },
  { x: "28%", y: "92%", s: 1.5, d: 10.5, delay: 1.6 },
  { x: "41%", y: "74%", s: 2, d: 9.0, delay: 0.7 },
  { x: "58%", y: "88%", s: 2.5, d: 8.0, delay: 2.4 },
  { x: "70%", y: "70%", s: 1.5, d: 11.0, delay: 1.1 },
  { x: "83%", y: "86%", s: 2, d: 9.6, delay: 3.0 },
  { x: "50%", y: "95%", s: 2.5, d: 7.6, delay: 2.0 },
];

export default function IntroCinematic({
  onExitStart,
  onDone,
}: {
  onExitStart?: () => void;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(reduce ? 4 : 0);
  const [exiting, setExiting] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (reduce) {
      const t = setTimeout(finish, RT_EXIT);
      return () => clearTimeout(t);
    }
    const timers = [
      setTimeout(() => setPhase(1), T_WORD),
      setTimeout(() => setPhase(2), T_SHEEN),
      setTimeout(() => setPhase(3), T_RULE),
      setTimeout(() => setPhase(4), T_TAG),
      setTimeout(finish, T_EXIT),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  function finish() {
    if (done.current) return;
    done.current = true;
    setExiting(true);
    onExitStart?.();
    setTimeout(onDone, reduce ? 700 : EXIT_MS);
  }

  const wordIn = phase >= 1;
  const sheenIn = phase >= 2;
  const ruleIn = phase >= 3;
  const tagIn = phase >= 4;

  let li = -1; // running letter index for the stagger

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: "#07080c", isolation: "isolate", perspective: 1200 }}
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduce ? 0.55 : EXIT_MS / 1000, ease: EXPO_IN_OUT }}
    >
      {/* Receding grid — fades in, then slides past on exit. No idle loop. */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[56%] h-[120vh] w-[220vw] origin-top -translate-x-1/2"
          style={{
            transform: "translateX(-50%) rotateX(72deg)",
            backgroundImage:
              "linear-gradient(hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.11) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.11) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            WebkitMaskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, #000 0%, transparent 72%)",
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: exiting ? 0 : 0.8, y: exiting ? 90 : 0 }}
          transition={{ duration: exiting ? EXIT_MS / 1000 : 1.6, ease: exiting ? EXPO_IN_OUT : "easeOut" }}
        />
      )}

      {/* Accent glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[130vmax] w-[130vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) - 4%) / 0.24) 0%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) - 14%) / 0.1) 30%, transparent 60%)",
        }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 1.35 : 1 }}
        transition={{ duration: exiting ? EXIT_MS / 1000 : 2.0, ease: exiting ? EXPO_IN_OUT : EXPO }}
      />

      {/* Motes */}
      {!reduce && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {MOTES.map((m, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{
                left: m.x,
                top: m.y,
                width: m.s,
                height: m.s,
                background: "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 22%))",
                boxShadow: "0 0 10px hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 16%) / 0.9)",
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: [0, 0.7, 0], y: -170 }}
              transition={{ duration: m.d, ease: "easeInOut", delay: m.delay, repeat: Infinity }}
            />
          ))}
        </div>
      )}

      {/* Centre group — subtle continuous push-in, then push-through on exit */}
      <motion.div
        className="relative z-[2] flex flex-col items-center px-6 text-center"
        initial={{ scale: reduce ? 1 : 0.985 }}
        animate={
          exiting
            ? { scale: reduce ? 1.03 : 1.12, y: reduce ? 0 : -14, opacity: 0 }
            : { scale: reduce ? 1 : 1.03 }
        }
        transition={
          exiting
            ? { duration: reduce ? 0.55 : EXIT_MS / 1000, ease: EXPO_IN_OUT }
            : { duration: 4.2, ease: "linear" }
        }
      >
        {/* Mark */}
        <motion.div
          className="relative grid h-[88px] w-[88px] place-items-center"
          initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 190, damping: 18, delay: 0.28 }
          }
        >
          {/* soft halo */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              inset: "-45%",
              background:
                "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%) / 0.5), transparent 62%)",
              filter: "blur(14px)",
            }}
            initial={{ opacity: 0 }}
            animate={
              reduce
                ? { opacity: 0.9 }
                : { opacity: [0, 0.95, 0.7, 0.95], scale: [0.9, 1.06, 1, 1.06] }
            }
            transition={
              reduce
                ? { duration: 0.4 }
                : { duration: 4.5, ease: "easeInOut", repeat: Infinity, delay: 0.5 }
            }
          />
          {/* one ring pushing out as the mark lands */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute rounded-[22px] border"
              style={{
                inset: "-6px",
                borderWidth: 1.5,
                borderColor: "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 12%) / 0.65)",
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: [0, 0.85, 0], scale: 2.1 }}
              transition={{ duration: 1.4, ease: EXPO, delay: 0.42 }}
            />
          )}
          {/* light bar sweeping once behind the mark */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute h-[3px] w-[70vw] max-w-[520px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 24%) / 0.85) 42%, #fff 50%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 20%) / 0.85) 58%, transparent)",
                filter: "blur(0.5px)",
              }}
              initial={{ x: "-60%", opacity: 0 }}
              animate={{ x: "60%", opacity: [0, 1, 0] }}
              transition={{ duration: 1.1, ease: EXPO, delay: 0.5 }}
            />
          )}
          <Image
            src="/logo-mark.png"
            alt=""
            width={88}
            height={88}
            priority
            className="relative z-[2] rounded-[20px]"
            style={{
              boxShadow:
                "0 0 0 1px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.35), 0 0 55px -8px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.65)",
            }}
          />
        </motion.div>

        {/* Wordmark — each letter rises from behind a clip line */}
        <div className="relative mt-9">
          <h1
            aria-label="Varaxis Scholar"
            className="inline-block select-none whitespace-nowrap font-semibold text-[#f0f3fb]"
            style={{ fontSize: "clamp(2.15rem, 6.2vw, 3.7rem)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            {WORDS.map((word, wi) => (
              <span
                key={wi}
                className="inline-block whitespace-nowrap"
                style={{ marginRight: wi < WORDS.length - 1 ? "0.32em" : 0 }}
              >
                {word.split("").map((ch) => {
                  li += 1;
                  const idx = li;
                  return (
                    <span
                      key={idx}
                      className="inline-block overflow-hidden"
                      style={{ verticalAlign: "bottom" }}
                    >
                      <motion.span
                        className="inline-block will-change-transform"
                        initial={reduce ? { y: "0%" } : { y: "125%" }}
                        animate={{ y: wordIn || reduce ? "0%" : "125%" }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 230, damping: 30, delay: idx * 0.042 }
                        }
                      >
                        {ch}
                      </motion.span>
                    </span>
                  );
                })}
              </span>
            ))}
          </h1>

          {/* sheen passing across the settled type */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                mixBlendMode: "overlay",
              }}
              initial={{ left: "-40%", opacity: 0 }}
              animate={sheenIn ? { left: "130%", opacity: [0, 1, 0] } : { opacity: 0 }}
              transition={{ duration: 0.85, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Rule */}
        <motion.span
          aria-hidden
          className="mt-6 block h-px origin-center"
          style={{
            width: "min(220px, 52vw)",
            background:
              "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 16%) / 0.9), hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 12%) / 0.9), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: ruleIn || reduce ? 1 : 0, opacity: ruleIn || reduce ? 1 : 0 }}
          transition={{ duration: 0.9, ease: EXPO }}
        />

        {/* Tagline */}
        <motion.p
          className="mt-4 text-[0.92rem]"
          style={{ color: "rgb(148 163 184 / 0.92)" }}
          initial={reduce ? { opacity: 1, y: 0, letterSpacing: "0.02em" } : { opacity: 0, y: 8, letterSpacing: "0.34em" }}
          animate={{
            opacity: tagIn || reduce ? 1 : 0,
            y: tagIn || reduce ? 0 : 8,
            letterSpacing: tagIn || reduce ? "0.02em" : "0.34em",
          }}
          transition={{ duration: 1.1, ease: EXPO }}
        >
          {TAGLINE}
        </motion.p>
      </motion.div>

      {/* Exit flare */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3]"
          style={{
            background:
              "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 30%) / 0.5) 0%, transparent 60%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: exiting ? [0, 0.9, 0] : 0 }}
          transition={{ duration: 0.85, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}
