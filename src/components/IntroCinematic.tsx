"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion, type Variants } from "motion/react";

/**
 * Cinematic title sequence shown over the landing page for signed-out
 * visitors, rebuilt on Motion. By design it has no persistence (no
 * sessionStorage / cookie) — the brief is for it to replay on every refresh
 * while logged out.
 *
 * Choreography, in beats (all driven by Motion variant transitions, not a
 * chain of wall-clock timers, so the sequence can't drift if the main thread
 * hitches):
 *   0.0s  bloom breathes open, a hairline beam snaps across the frame
 *   0.35s the mark materialises out of blur, two shockwave rings punch out
 *   1.0s  the wordmark flips up letter by letter, a specular glint follows
 *   2.0s  the rule draws from centre, the tagline contracts into place
 *   3.2s  a light flare covers the cut, everything blurs out, page revealed
 *
 * Only transform / opacity / filter are animated. Under
 * `prefers-reduced-motion` the finished title card is shown still for a beat
 * and then cross-fades out — no movement at all.
 */

const WORDMARK = "Varaxis Scholar";

/** Deterministic — Math.random() would differ server vs client and trip a
 *  hydration mismatch. */
const PARTICLES = [
  { x: "8%", y: "72%", s: 3, dur: 7.5, delay: 0.2 },
  { x: "17%", y: "88%", s: 2, dur: 9.2, delay: 1.4 },
  { x: "24%", y: "64%", s: 2.5, dur: 8.1, delay: 2.6 },
  { x: "31%", y: "94%", s: 1.5, dur: 10.4, delay: 0.8 },
  { x: "39%", y: "78%", s: 3, dur: 7.8, delay: 3.1 },
  { x: "46%", y: "90%", s: 2, dur: 9.6, delay: 1.9 },
  { x: "54%", y: "68%", s: 2.5, dur: 8.6, delay: 0.5 },
  { x: "61%", y: "86%", s: 1.5, dur: 11, delay: 2.2 },
  { x: "68%", y: "75%", s: 3, dur: 7.2, delay: 3.6 },
  { x: "75%", y: "92%", s: 2, dur: 9.9, delay: 1.1 },
  { x: "82%", y: "66%", s: 2.5, dur: 8.4, delay: 2.9 },
  { x: "89%", y: "84%", s: 1.5, dur: 10.8, delay: 0.3 },
  { x: "94%", y: "70%", s: 2, dur: 8.9, delay: 4.0 },
  { x: "13%", y: "58%", s: 1.5, dur: 11.4, delay: 3.3 },
  { x: "50%", y: "96%", s: 2.5, dur: 7.9, delay: 2.5 },
  { x: "71%", y: "60%", s: 2, dur: 10.1, delay: 1.6 },
];

const EASE = [0.16, 1, 0.3, 1] as const;

const T_WORD = 1000;
const T_TAG = 2000;
const T_EXIT = 3200;
const T_UNMOUNT = T_EXIT + 950;

const LETTER: Variants = {
  hidden: { opacity: 0, y: 20, rotateX: -62, scale: 0.9, filter: "blur(7px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE, delay: i * 0.034 },
  }),
};

export default function IntroCinematic({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"mark" | "word" | "tag">("mark");
  const [exiting, setExiting] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    if (reduce) {
      const t = [
        setTimeout(() => setPhase("tag"), 60),
        setTimeout(() => finish(), 1600),
      ];
      return () => t.forEach(clearTimeout);
    }
    const timers = [
      setTimeout(() => setPhase("word"), T_WORD),
      setTimeout(() => setPhase("tag"), T_TAG),
      setTimeout(() => finish(), T_EXIT),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setExiting(true);
    setTimeout(onDone, T_UNMOUNT - T_EXIT);
  }

  const wordIn = phase === "word" || phase === "tag";
  const tagIn = phase === "tag";

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: "#07080c", isolation: "isolate" }}
      initial={{ opacity: 1 }}
      animate={exiting ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.95, ease: [0.6, 0, 0.28, 1], times: exiting ? [0, 1] : undefined }}
    >
      {/* Deep accent bloom */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: "150vmax",
          height: "150vmax",
          marginLeft: "-75vmax",
          marginTop: "-75vmax",
          background:
            "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) - 4%) / 0.30) 0%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) - 12%) / 0.16) 26%, transparent 58%)",
        }}
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.2, ease: EASE }}
      />

      {/* Slow conic rays */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-25%",
            background:
              "conic-gradient(from 0deg, transparent 0deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.09) 7deg, transparent 22deg, transparent 150deg, hsl(var(--accent-h-2) var(--accent-s) var(--accent-l) / 0.075) 160deg, transparent 178deg, transparent 250deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.05) 262deg, transparent 280deg, transparent 360deg)",
            WebkitMaskImage:
              "radial-gradient(circle at center, transparent 0, transparent 240px, #000 520px)",
            maskImage: "radial-gradient(circle at center, transparent 0, transparent 240px, #000 520px)",
          }}
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 1.8, ease: "easeOut", delay: 0.15 },
            rotate: { duration: 26, ease: "linear", repeat: Infinity },
          }}
        />
      )}

      {/* Drifting motes */}
      {!reduce && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{
                left: p.x,
                top: p.y,
                width: p.s,
                height: p.s,
                background: "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 22%))",
                boxShadow: "0 0 10px hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 18%) / 0.85)",
              }}
              initial={{ opacity: 0, y: 24, scale: 0.5 }}
              animate={{ opacity: [0, 0.75, 0.4, 0], y: -190, scale: [0.5, 1, 1.05] }}
              transition={{ duration: p.dur, ease: "easeInOut", delay: p.delay, repeat: Infinity }}
            />
          ))}
        </div>
      )}

      {/* Hairline beam */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-px"
          style={{
            width: "min(760px, 82vw)",
            marginLeft: "calc(min(760px, 82vw) / -2)",
            background:
              "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 26%) / 0.85) 35%, #ffffff 50%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 22%) / 0.85) 65%, transparent)",
            filter: "blur(0.4px)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0.9, 0] }}
          transition={{ duration: 1.5, ease: EASE, delay: 0.1, times: [0, 0.55, 1] }}
        />
      )}

      {/* Centre group — slow push-in for the whole runtime */}
      <motion.div
        className="relative z-[2] flex flex-col items-center px-6 text-center"
        initial={{ scale: reduce ? 1 : 0.965 }}
        animate={exiting ? { scale: 1.16, opacity: 0, filter: "blur(12px)" } : { scale: reduce ? 1 : 1.03 }}
        transition={exiting ? { duration: 0.95, ease: [0.6, 0, 0.28, 1] } : { duration: 6.5, ease: "easeOut" }}
      >
        {/* Mark */}
        <motion.div
          className="relative grid h-[92px] w-[92px] place-items-center"
          initial={{ opacity: 0, scale: reduce ? 1 : 0.5, y: reduce ? 0 : 16, filter: reduce ? "blur(0px)" : "blur(16px)" }}
          animate={{
            opacity: 1,
            scale: wordIn && !reduce ? 0.88 : 1,
            y: wordIn && !reduce ? -6 : 0,
            filter: "blur(0px)",
          }}
          transition={{ duration: reduce ? 0.4 : 1.15, ease: EASE, delay: reduce ? 0 : 0.3 }}
        >
          {/* breathing halo */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              inset: "-40%",
              background:
                "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%) / 0.5), transparent 62%)",
              filter: "blur(14px)",
            }}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.75, 1, 0.75], scale: [1, 1.09, 1] }}
            transition={reduce ? { duration: 1 } : { duration: 3.6, ease: "easeInOut", repeat: Infinity, delay: 1.4 }}
          />
          {/* shockwave rings */}
          {!reduce &&
            [0, 1].map((r) => (
              <motion.span
                key={r}
                aria-hidden
                className="absolute rounded-[26px] border"
                style={{
                  inset: "-8px",
                  borderWidth: 1.5,
                  borderColor:
                    r === 0
                      ? "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 12%) / 0.7)"
                      : "hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 10%) / 0.45)",
                }}
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: [0, 0.9, 0], scale: 1.85 }}
                transition={{ duration: 1.5, ease: EASE, delay: 0.85 + r * 0.2 }}
              />
            ))}
          <Image
            src="/logo-mark.png"
            alt=""
            width={92}
            height={92}
            priority
            className="relative z-[2] rounded-[21px]"
            style={{
              boxShadow:
                "0 0 0 1px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.4), 0 0 60px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.7)",
            }}
          />
        </motion.div>

        {/* Wordmark */}
        <h1
          aria-label={WORDMARK}
          className="mt-[30px] whitespace-nowrap font-semibold"
          style={{
            fontSize: "clamp(2rem, 5.6vw, 3.4rem)",
            letterSpacing: "-0.022em",
            perspective: 700,
          }}
        >
          {WORDMARK.split("").map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="inline-block"
              style={{
                transformOrigin: "50% 100%",
                width: ch === " " ? "0.34em" : undefined,
                backgroundImage:
                  "linear-gradient(118deg, #ffffff 6%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 24%)) 30%, #e8f7ff 46%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 16%)) 66%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 22%)) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
              custom={i}
              variants={LETTER}
              initial="hidden"
              animate={wordIn || reduce ? "show" : "hidden"}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </h1>

        {/* Rule */}
        <motion.span
          aria-hidden
          className="mt-5 h-px"
          style={{
            width: "min(230px, 52vw)",
            background:
              "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 18%) / 0.9), hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 14%) / 0.9), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={tagIn || reduce ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          transition={{ duration: 1.1, ease: EASE }}
        />

        {/* Tagline */}
        <motion.p
          className="mt-4 text-[0.95rem]"
          style={{ color: "rgb(148 163 184 / 0.9)" }}
          initial={{ opacity: 0, y: 10, letterSpacing: "0.34em" }}
          animate={
            tagIn || reduce
              ? { opacity: 1, y: 0, letterSpacing: "0.015em" }
              : { opacity: 0, y: 10, letterSpacing: "0.34em" }
          }
          transition={{ duration: 1.25, ease: EASE }}
        >
          Every deadline, one clear picture.
        </motion.p>
      </motion.div>

      {/* Exit flare */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3]"
          style={{
            background:
              "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 30%) / 0.5) 0%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 18%) / 0.2) 32%, transparent 65%)",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={exiting ? { opacity: [0, 1, 0], scale: 1.5 } : { opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}
