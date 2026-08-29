"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useMotionTemplate, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * Cinematic title sequence shown over the landing page for signed-out
 * visitors. Rebuilt as a proper multi-act title card on Motion. By design it
 * has no persistence (no sessionStorage / cookie) — the brief is for it to
 * replay on every refresh while logged out, and there is no skip control.
 *
 * The acts, in beats (every element timing is a Motion transition, not a
 * chain of wall-clock timers, so the choreography can't drift if the main
 * thread hitches — React only flips the phase that gates each act):
 *
 *   0.0s  black. a perspective grid glides in underfoot, a deep accent bloom
 *         breathes open, motes lift through the frame
 *   0.5s  a hairline strikes horizontally and blooms into a soft band
 *   0.9s  the mark resolves out of a bright seed; an anamorphic flare streak
 *         rips across it; two shock rings punch outward; the halo breathes
 *   1.7s  the wordmark is wiped in left-to-right behind a travelling light
 *         bar, its gradient reading as one continuous sweep
 *   2.6s  a specular glint travels back across the type
 *   3.1s  a rule draws from the centre; the tagline contracts into place
 *   5.3s  push-through — the whole composition scales up and blurs, a flare
 *         washes the cut, the grid rushes past, and the finished landing
 *         page is revealed underneath (its entrance is held until here so
 *         the handoff reads as one move — see HomeIntroGate)
 *   6.4s  unmount
 *
 * Only transform / opacity / filter / clip-path are animated. Under
 * `prefers-reduced-motion` the finished card is shown still for a beat and
 * then cross-fades out — no movement at all.
 */

const WORDMARK = "Varaxis Scholar";
const TAGLINE = "Every deadline, one clear picture.";

const EASE = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.6, 0, 0.28, 1] as const;

/* Beat boundaries, ms from mount. */
const T_WORD = 1700;
const T_GLINT = 2600;
const T_RULE = 3100;
const T_TAG = 3550;
const T_EXIT = 5300;
const T_UNMOUNT = T_EXIT + 1100;

const RT_EXIT = 1900;
const RT_UNMOUNT = RT_EXIT + 700;

/** Deterministic — Math.random() would differ server vs client and trip a
 *  hydration mismatch. */
const PARTICLES = [
  { x: "6%", y: "78%", s: 2.5, dur: 8.5, delay: 0.0, drift: -210 },
  { x: "12%", y: "92%", s: 1.5, dur: 10.2, delay: 1.1, drift: -170 },
  { x: "19%", y: "68%", s: 3, dur: 7.8, delay: 2.3, drift: -240 },
  { x: "26%", y: "88%", s: 1.5, dur: 11.0, delay: 0.6, drift: -160 },
  { x: "33%", y: "74%", s: 2.5, dur: 8.2, delay: 3.0, drift: -220 },
  { x: "40%", y: "94%", s: 2, dur: 9.6, delay: 1.7, drift: -180 },
  { x: "47%", y: "64%", s: 3, dur: 7.4, delay: 0.4, drift: -250 },
  { x: "53%", y: "90%", s: 1.5, dur: 10.8, delay: 2.1, drift: -165 },
  { x: "60%", y: "72%", s: 2.5, dur: 8.7, delay: 3.4, drift: -230 },
  { x: "67%", y: "86%", s: 2, dur: 9.3, delay: 1.0, drift: -185 },
  { x: "74%", y: "66%", s: 3, dur: 7.9, delay: 2.7, drift: -245 },
  { x: "81%", y: "92%", s: 1.5, dur: 11.2, delay: 0.2, drift: -155 },
  { x: "88%", y: "76%", s: 2.5, dur: 8.4, delay: 3.7, drift: -225 },
  { x: "94%", y: "84%", s: 2, dur: 9.9, delay: 1.4, drift: -175 },
  { x: "16%", y: "58%", s: 1.5, dur: 12.0, delay: 3.1, drift: -140 },
  { x: "50%", y: "97%", s: 2.5, dur: 7.6, delay: 2.4, drift: -260 },
  { x: "72%", y: "60%", s: 2, dur: 10.4, delay: 1.5, drift: -150 },
  { x: "35%", y: "55%", s: 1.5, dur: 12.6, delay: 0.9, drift: -135 },
];

export default function IntroCinematic({
  onExitStart,
  onDone,
}: {
  onExitStart?: () => void;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"open" | "word" | "glint" | "rule" | "tag">("open");
  const [exiting, setExiting] = useState(false);
  const finishing = useRef(false);

  // Wipe progress 0 → 1. Drives the wordmark clip-path and the light bar that
  // rides its leading edge. All hooks are unconditional — reduced-motion just
  // snaps `wipe` to 1 rather than skipping the machinery.
  const wipe = useSpring(0, { duration: 0.82, bounce: 0 });
  const clipRight = useTransform(wipe, [0, 1], ["100%", "-1%"]);
  const wordClip = useMotionTemplate`inset(-18% ${clipRight} -18% -2%)`;
  const barLeft = useTransform(wipe, [0, 1], ["-1%", "101%"]);

  useEffect(() => {
    if (reduce) {
      setPhase("tag");
      wipe.set(1);
      const t = [setTimeout(finish, RT_EXIT)];
      return () => t.forEach(clearTimeout);
    }
    const timers = [
      setTimeout(() => {
        setPhase("word");
        wipe.set(1);
      }, T_WORD),
      setTimeout(() => setPhase("glint"), T_GLINT),
      setTimeout(() => setPhase("rule"), T_RULE),
      setTimeout(() => setPhase("tag"), T_TAG),
      setTimeout(finish, T_EXIT),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setExiting(true);
    onExitStart?.();
    const gap = reduce ? RT_UNMOUNT - RT_EXIT : T_UNMOUNT - T_EXIT;
    setTimeout(onDone, gap);
  }

  const wordIn = phase !== "open";
  const glintIn = phase === "glint" || phase === "rule" || phase === "tag";
  const ruleIn = phase === "rule" || phase === "tag";
  const tagIn = phase === "tag";

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: "#07080c", isolation: "isolate", perspective: 1400 }}
      animate={exiting ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: reduce ? 0.6 : 1.0, ease: EASE_IN }}
    >
      {/* Perspective grid gliding underfoot */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[58%] h-[130vh] w-[240vw] origin-top"
          style={{
            transform: "translateX(-50%) rotateX(74deg)",
            backgroundImage:
              "linear-gradient(hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.12) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.12) 1px, transparent 1px)",
            backgroundSize: "5vw 5vw",
            WebkitMaskImage: "radial-gradient(ellipse 60% 75% at 50% 0%, #000 5%, transparent 70%)",
            maskImage: "radial-gradient(ellipse 60% 75% at 50% 0%, #000 5%, transparent 70%)",
          }}
          initial={{ opacity: 0, backgroundPositionY: "0px" }}
          animate={
            exiting
              ? { opacity: 0, backgroundPositionY: "320px" }
              : { opacity: [0, 1, 1], backgroundPositionY: ["0px", "260px"] }
          }
          transition={
            exiting
              ? { duration: 1.05, ease: EASE_IN }
              : {
                  opacity: { duration: 2.0, ease: "easeOut" },
                  backgroundPositionY: { duration: 9, ease: "linear", repeat: Infinity },
                }
          }
        />
      )}

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
            "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) - 6%) / 0.26) 0%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) - 14%) / 0.13) 26%, transparent 58%)",
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={exiting ? { opacity: 0, scale: 1.3 } : { opacity: 1, scale: 1 }}
        transition={{ duration: exiting ? 1.0 : 2.4, ease: exiting ? EASE_IN : EASE }}
      />

      {/* Slow conic rays */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-25%",
            background:
              "conic-gradient(from 0deg, transparent 0deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.06) 8deg, transparent 24deg, transparent 150deg, hsl(var(--accent-h-2) var(--accent-s) var(--accent-l) / 0.05) 162deg, transparent 180deg, transparent 252deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.035) 264deg, transparent 282deg, transparent 360deg)",
            WebkitMaskImage: "radial-gradient(circle at center, transparent 0, transparent 260px, #000 560px)",
            maskImage: "radial-gradient(circle at center, transparent 0, transparent 260px, #000 560px)",
          }}
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: exiting ? 0 : 1, rotate: 360 }}
          transition={{
            opacity: { duration: exiting ? 0.8 : 2.0, ease: "easeOut", delay: exiting ? 0 : 0.2 },
            rotate: { duration: 34, ease: "linear", repeat: Infinity },
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
                background: "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 24%))",
                boxShadow: "0 0 12px hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 18%) / 0.9)",
              }}
              initial={{ opacity: 0, y: 20, scale: 0.4 }}
              animate={{ opacity: [0, 0.8, 0.35, 0], y: p.drift, scale: [0.4, 1, 1.1] }}
              transition={{ duration: p.dur, ease: "easeInOut", delay: p.delay, repeat: Infinity }}
            />
          ))}
        </div>
      )}

      {/* Hairline strike → soft band */}
      {!reduce && (
        <>
          <motion.div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-px"
            style={{
              width: "min(900px, 90vw)",
              marginLeft: "calc(min(900px, 90vw) / -2)",
              background:
                "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 28%) / 0.9) 32%, #ffffff 50%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 24%) / 0.9) 68%, transparent)",
              filter: "blur(0.4px)",
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0.9, 0] }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.35, times: [0, 0.5, 1] }}
          />
          <motion.div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "min(760px, 82vw)",
              height: 120,
              background:
                "radial-gradient(ellipse at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%) / 0.22), transparent 70%)",
              filter: "blur(24px)",
            }}
            initial={{ scaleX: 0.2, opacity: 0 }}
            animate={{ scaleX: [0.2, 1], opacity: [0, 0.9, 0] }}
            transition={{ duration: 1.9, ease: EASE, delay: 0.5 }}
          />
        </>
      )}

      {/* Centre group — slow push-in for the whole runtime, then push-through */}
      <motion.div
        className="relative z-[2] flex flex-col items-center px-6 text-center"
        initial={{ scale: reduce ? 1 : 0.955 }}
        animate={
          exiting
            ? { scale: reduce ? 1.05 : 1.22, opacity: 0, filter: reduce ? "blur(0px)" : "blur(14px)" }
            : { scale: reduce ? 1 : 1.035 }
        }
        transition={
          exiting ? { duration: reduce ? 0.6 : 1.05, ease: EASE_IN } : { duration: 7.5, ease: "easeOut" }
        }
      >
        {/* Mark */}
        <motion.div
          className="relative grid h-[100px] w-[100px] place-items-center"
          initial={{ opacity: 0, scale: reduce ? 1 : 0.35, filter: reduce ? "blur(0px)" : "blur(18px)" }}
          animate={{
            opacity: 1,
            scale: wordIn && !reduce ? 0.86 : 1,
            y: wordIn && !reduce ? -6 : 0,
            filter: "blur(0px)",
          }}
          transition={{ duration: reduce ? 0.4 : 1.2, ease: EASE, delay: reduce ? 0 : 0.55 }}
        >
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute h-3 w-3 rounded-full bg-white"
              style={{ boxShadow: "0 0 40px 12px hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 20%) / 0.9)" }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, 1.4, 3] }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
            />
          )}
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute h-[2px] w-[420px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 26%) / 0.9) 40%, #fff 50%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 26%) / 0.9) 60%, transparent)",
                filter: "blur(1px)",
              }}
              initial={{ opacity: 0, scaleX: 0.2 }}
              animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1.1, 0.2] }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.85 }}
            />
          )}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              inset: "-42%",
              background:
                "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%) / 0.5), transparent 62%)",
              filter: "blur(15px)",
            }}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.7, 1, 0.7], scale: [1, 1.1, 1] }}
            transition={reduce ? { duration: 1 } : { duration: 3.8, ease: "easeInOut", repeat: Infinity, delay: 1.5 }}
          />
          {!reduce &&
            [0, 1].map((r) => (
              <motion.span
                key={r}
                aria-hidden
                className="absolute rounded-[24px] border"
                style={{
                  inset: "-8px",
                  borderWidth: 1.5,
                  borderColor:
                    r === 0
                      ? "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 12%) / 0.7)"
                      : "hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 10%) / 0.45)",
                }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.9, 0], scale: 2.0 }}
                transition={{ duration: 1.7, ease: EASE, delay: 0.95 + r * 0.22 }}
              />
            ))}
          <Image
            src="/logo-mark.png"
            alt=""
            width={100}
            height={100}
            priority
            className="relative z-[2] rounded-[22px]"
            style={{
              boxShadow:
                "0 0 0 1px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.4), 0 0 70px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.7)",
            }}
          />
        </motion.div>

        {/* Wordmark — wiped in behind a travelling light bar */}
        <div className="relative mt-8">
          <motion.h1
            aria-label={WORDMARK}
            className="whitespace-nowrap font-semibold"
            style={{
              fontSize: "clamp(2rem, 5.8vw, 3.6rem)",
              letterSpacing: "-0.022em",
              clipPath: wordClip,
            }}
          >
            {WORDMARK.split("").map((ch, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  width: ch === " " ? "0.34em" : undefined,
                  backgroundImage:
                    "linear-gradient(118deg, #ffffff 6%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 24%)) 30%, #eaf1ff 46%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 16%)) 66%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 22%)) 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {ch === " " ? " " : ch}
              </span>
            ))}
          </motion.h1>

          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute top-1/2 h-[135%] w-[3px] -translate-x-1/2 -translate-y-1/2"
              style={{
                left: barLeft,
                background:
                  "linear-gradient(180deg, transparent, #fff 20%, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 26%)) 50%, #fff 80%, transparent)",
                boxShadow: "0 0 20px 4px hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 20%) / 0.8)",
              }}
              animate={{ opacity: wordIn && !glintIn ? 1 : 0 }}
              transition={{ duration: 0.35 }}
            />
          )}

          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-[45%]"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.55), transparent)",
                mixBlendMode: "overlay",
              }}
              initial={{ left: "110%", opacity: 0 }}
              animate={glintIn ? { left: ["110%", "-55%"], opacity: [0, 1, 0] } : { opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Rule */}
        <motion.span
          aria-hidden
          className="mt-6 block h-px"
          style={{
            width: "min(240px, 54vw)",
            background:
              "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 18%) / 0.9), hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 14%) / 0.9), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={ruleIn || reduce ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          transition={{ duration: 1.1, ease: EASE }}
        />

        {/* Tagline — contracts into place */}
        <motion.p
          className="mt-4 text-[0.95rem]"
          style={{ color: "rgb(148 163 184 / 0.92)" }}
          initial={{ opacity: 0, y: 10, letterSpacing: "0.42em" }}
          animate={
            tagIn || reduce
              ? { opacity: 1, y: 0, letterSpacing: "0.01em" }
              : { opacity: 0, y: 10, letterSpacing: "0.42em" }
          }
          transition={{ duration: 1.25, ease: EASE }}
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
              "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 32%) / 0.55) 0%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 20%) / 0.22) 32%, transparent 66%)",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={exiting ? { opacity: [0, 1, 0], scale: 1.6 } : { opacity: 0 }}
          transition={{ duration: 0.95, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}
