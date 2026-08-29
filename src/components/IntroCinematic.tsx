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
 * Everything moves on transform + opacity so the whole sequence stays on the
 * compositor. Springs carry the "arrival" beats (mark, letters), expo curves
 * carry the light and the fades, and each beat is timed to begin only once
 * the previous one has actually settled — the earlier version fired its
 * highlight while the type was still rising, which is what made it read as
 * broken.
 *
 * Beats (ms from mount):
 *   0.00  the frame lifts from black — a deep blue glow and a receding grid
 *         ease in; a few motes drift upward
 *   0.30  the mark springs to size over its own reflection; a ring pushes
 *         out; a blue light bar sweeps once behind it
 *   1.10  the wordmark tips up letter by letter from behind a clip line
 *   2.25  a soft blue wavefront travels through the settled type — a
 *         radial crest, blurred and screen-blended, so it reads as light
 *         passing over the letterforms rather than a box crossing them
 *   2.55  a hairline rule draws out from the centre
 *   2.85  the tagline rises word by word
 *   4.70  push-through — the group scales up and away, the glow blooms, the
 *         grid slides past, and the landing page rises into the same space
 *         underneath (HomeIntroGate holds its entrance until here)
 *   5.70  unmount
 *
 * Under `prefers-reduced-motion` the finished card is shown still, held for
 * a beat, then cross-faded out.
 */

const EXPO = [0.16, 1, 0.3, 1] as const;
const EXPO_IN_OUT = [0.65, 0, 0.35, 1] as const;
/** Slow-in, long glide — the curve the light sweeps ride. */
const GLIDE = [0.4, 0.05, 0.2, 1] as const;

const WORDS = ["Varaxis", "Scholar"];
const TAGLINE = "Every deadline, one clear picture.";

const T_WORD = 1100;
const T_SHEEN = 2250;
const T_RULE = 2550;
const T_TAG = 2850;
const T_EXIT = 4700;
const EXIT_MS = 1000;

const RT_EXIT = 1800;

/** Deterministic positions — Math.random() would desync server vs client. */
const MOTES = [
  { x: "14%", y: "82%", s: 2.5, d: 9.0, delay: 0.2 },
  { x: "28%", y: "92%", s: 1.5, d: 11.0, delay: 1.6 },
  { x: "41%", y: "74%", s: 2, d: 9.6, delay: 0.7 },
  { x: "58%", y: "88%", s: 2.5, d: 8.4, delay: 2.4 },
  { x: "70%", y: "70%", s: 1.5, d: 11.6, delay: 1.1 },
  { x: "83%", y: "86%", s: 2, d: 10.2, delay: 3.0 },
  { x: "50%", y: "95%", s: 2.5, d: 8.0, delay: 2.0 },
];

/**
 * Solid fill, deliberately not a `background-clip: text` gradient: these
 * glyphs also carry a 3D `rotateX` as they tip up, and Chromium drops the
 * clipped background entirely when both land on the same element — the type
 * renders invisible. The depth comes from the underglow and the wavefront
 * passing over it instead.
 */
const TYPE_FILL = "#eef2fb";

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

  let li = -1; // running letter index, for the rise stagger

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: "#07080c", isolation: "isolate" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduce ? 0.55 : EXIT_MS / 1000, ease: EXPO_IN_OUT }}
    >
      {/* Receding grid — eases in, slides past on exit. No idle loop. */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[56%] h-[120vh] w-[220vw] origin-top"
          style={{
            transform: "translateX(-50%) rotateX(72deg)",
            backgroundImage:
              "linear-gradient(hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.13) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.13) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
            WebkitMaskImage: "radial-gradient(ellipse 52% 68% at 50% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(ellipse 52% 68% at 50% 0%, #000 0%, transparent 72%)",
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: exiting ? 0 : 0.75, y: exiting ? 110 : 0 }}
          transition={{
            duration: exiting ? EXIT_MS / 1000 : 1.8,
            ease: exiting ? EXPO_IN_OUT : "easeOut",
          }}
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
              animate={{ opacity: [0, 0.65, 0], y: -175 }}
              transition={{ duration: m.d, ease: "easeInOut", delay: m.delay, repeat: Infinity }}
            />
          ))}
        </div>
      )}

      {/* Centre group — slow push-in, then push-through on exit */}
      <motion.div
        className="relative z-[2] flex flex-col items-center px-6 text-center"
        initial={{ scale: reduce ? 1 : 0.985 }}
        animate={
          exiting
            ? { scale: reduce ? 1.03 : 1.13, y: reduce ? 0 : -16, opacity: 0 }
            : { scale: reduce ? 1 : 1.028 }
        }
        transition={
          exiting
            ? { duration: reduce ? 0.55 : EXIT_MS / 1000, ease: EXPO_IN_OUT }
            : { duration: 4.8, ease: "linear" }
        }
      >
        {/* ── Mark ─────────────────────────────────────────────────────── */}
        <motion.div
          className="relative grid h-[88px] w-[88px] place-items-center"
          initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.55, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={
            reduce ? { duration: 0 } : { type: "spring", stiffness: 185, damping: 17, delay: 0.3 }
          }
        >
          {/* soft halo */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              inset: "-48%",
              background:
                "radial-gradient(circle at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%) / 0.5), transparent 62%)",
              filter: "blur(15px)",
            }}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 0.9 } : { opacity: [0, 0.95, 0.72, 0.95], scale: [0.9, 1.07, 1, 1.07] }}
            transition={
              reduce ? { duration: 0.4 } : { duration: 5, ease: "easeInOut", repeat: Infinity, delay: 0.55 }
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
                borderColor: "hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 14%) / 0.6)",
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: [0, 0.8, 0], scale: 2.2 }}
              transition={{ duration: 1.5, ease: EXPO, delay: 0.45 }}
            />
          )}

          {/* blue light bar sweeping once behind the mark */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute h-[3px] w-[70vw] max-w-[540px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 20%) / 0.75) 40%, hsl(var(--accent-h) 100% 92%) 50%, hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 18%) / 0.75) 60%, transparent)",
                filter: "blur(1.5px)",
              }}
              initial={{ x: "-58%", opacity: 0 }}
              animate={{ x: "58%", opacity: [0, 1, 0] }}
              transition={{ duration: 1.2, ease: EXPO, delay: 0.5 }}
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

          {/* Mirrored reflection beneath — pure depth cue.
              The flip lives on a plain wrapper so Motion never has to share
              ownership of `transform` with it. Inside that flipped space the
              element's bottom edge renders adjacent to the mark, so the
              image is anchored bottom (mirroring the logo's lower edge) and
              the mask runs opaque-at-bottom → clear-at-top. */}
          {!reduce && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-full z-[1]"
              style={{ width: 88, height: 56, transform: "translateX(-50%) scaleY(-1)" }}
            >
              <motion.span
                className="block h-full w-full"
                style={{
                  backgroundImage: "url(/logo-mark.png)",
                  backgroundSize: "88px 88px",
                  backgroundPosition: "bottom center",
                  backgroundRepeat: "no-repeat",
                  borderRadius: 20,
                  WebkitMaskImage: "linear-gradient(to top, #000 0%, transparent 80%)",
                  maskImage: "linear-gradient(to top, #000 0%, transparent 80%)",
                  filter: "blur(1.5px)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.16 }}
                transition={{ duration: 1.2, ease: EXPO, delay: 0.65 }}
              />
            </span>
          )}
        </motion.div>

        {/* ── Wordmark ─────────────────────────────────────────────────── */}
        <div className="relative mt-9">
          {/* underglow that swells once as the type lands */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[135%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse at center, hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 6%) / 0.35), transparent 70%)",
                filter: "blur(26px)",
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={wordIn ? { opacity: [0, 0.9, 0.45], scale: [0.8, 1.06, 1] } : { opacity: 0 }}
              transition={{ duration: 1.6, ease: EXPO }}
            />
          )}

          <h1
            aria-label="Varaxis Scholar"
            className="relative inline-block select-none whitespace-nowrap font-semibold"
            style={{
              fontSize: "clamp(2.15rem, 6.2vw, 3.7rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              perspective: 820,
            }}
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
                        style={{ transformOrigin: "50% 100%", color: TYPE_FILL }}
                        initial={reduce ? { y: "0%", rotateX: 0 } : { y: "125%", rotateX: -38 }}
                        animate={{
                          y: wordIn || reduce ? "0%" : "125%",
                          rotateX: wordIn || reduce ? 0 : -38,
                        }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 220, damping: 28, delay: idx * 0.045 }
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

          {/* ── Wavefront ──────────────────────────────────────────────
              A blurred radial crest in `screen` blend, not a rectangle in
              `overlay`: on a near-black stage screen-blending a shape whose
              edges fall to transparent adds light without ever drawing a
              box. Two layers — a wide blue body and a tighter, brighter
              core just ahead of it — so the pass has a leading edge. */}
          {!reduce && (
            <>
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-y-[70%] left-0 w-[42%]"
                style={{
                  background:
                    "radial-gradient(ellipse 46% 52% at 50% 50%, hsl(var(--accent-h) 92% 74% / 0.5) 0%, hsl(var(--accent-h-2) 88% 66% / 0.22) 42%, transparent 74%)",
                  filter: "blur(16px)",
                  mixBlendMode: "screen",
                }}
                initial={{ x: "-170%", opacity: 0 }}
                animate={sheenIn ? { x: "410%", opacity: [0, 1, 1, 0] } : { opacity: 0 }}
                transition={{
                  x: { duration: 1.5, ease: GLIDE },
                  opacity: { duration: 1.5, ease: "linear", times: [0, 0.16, 0.7, 1] },
                }}
              />
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-y-[35%] left-0 w-[13%]"
                style={{
                  background:
                    "radial-gradient(ellipse 40% 55% at 50% 50%, hsl(var(--accent-h) 100% 90% / 0.62) 0%, hsl(var(--accent-h) 96% 78% / 0.28) 45%, transparent 75%)",
                  filter: "blur(7px)",
                  mixBlendMode: "screen",
                }}
                initial={{ x: "-420%", opacity: 0 }}
                animate={sheenIn ? { x: "1180%", opacity: [0, 1, 1, 0] } : { opacity: 0 }}
                transition={{
                  x: { duration: 1.5, ease: GLIDE },
                  opacity: { duration: 1.5, ease: "linear", times: [0, 0.18, 0.68, 1] },
                }}
              />
            </>
          )}
        </div>

        {/* ── Rule ─────────────────────────────────────────────────────── */}
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
          transition={{ duration: 1.0, ease: EXPO }}
        />

        {/* ── Tagline ──────────────────────────────────────────────────
            Word-by-word rise. The old version animated `letter-spacing`,
            which relays out the line on every frame; this is transform
            only and reads more deliberate anyway. */}
        <p
          aria-label={TAGLINE}
          className="mt-4 flex flex-wrap justify-center text-[0.92rem]"
          style={{ color: "rgb(154 168 190 / 0.92)", letterSpacing: "0.03em" }}
        >
          {TAGLINE.split(" ").map((w, i, arr) => (
            <motion.span
              key={i}
              aria-hidden
              className="inline-block whitespace-pre will-change-transform"
              initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: tagIn || reduce ? 1 : 0, y: tagIn || reduce ? 0 : 12 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.75, ease: EXPO, delay: i * 0.055 }
              }
            >
              {w}
              {i < arr.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </p>
      </motion.div>

      {/* Exit bloom */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3]"
          style={{
            background:
              "radial-gradient(circle at center, hsl(var(--accent-h) 90% 76% / 0.42) 0%, hsl(var(--accent-h-2) 85% 68% / 0.16) 30%, transparent 62%)",
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={exiting ? { opacity: [0, 0.95, 0], scale: 1.7 } : { opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}
