"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * Cinematic title sequence shown over the landing page for signed-out
 * visitors. By design it has no persistence (no sessionStorage / cookie) —
 * the brief was for it to replay on every refresh while logged out.
 *
 * Choreography, in beats:
 *   0.0s  bloom breathes open, a hairline beam snaps across the frame
 *   0.3s  the mark materialises out of blur, shockwave rings punch outward
 *   1.0s  the mark settles back, the wordmark flips up letter by letter
 *   1.6s  a specular glint travels across the type
 *   2.0s  rule draws out from centre, tagline contracts into place
 *   3.2s  light flares, everything blurs out, revealing the real page
 *
 * The individual element timings live in CSS (globals.css) as animation
 * delays rather than a chain of JS timers — if the main thread hitches
 * mid-sequence the whole thing stays in sync instead of drifting apart.
 * React only flips the three phase classes that gate each act.
 */

const WORDMARK = "Varaxis Scholar";

/** Deterministic — Math.random() here would differ between the server and
 *  client renders and trip a hydration mismatch. */
const PARTICLES = [
  { x: "8%",  y: "72%", s: "3px",   dur: "7.5s",  delay: "0.2s" },
  { x: "17%", y: "88%", s: "2px",   dur: "9.2s",  delay: "1.4s" },
  { x: "24%", y: "64%", s: "2.5px", dur: "8.1s",  delay: "2.6s" },
  { x: "31%", y: "94%", s: "1.5px", dur: "10.4s", delay: "0.8s" },
  { x: "39%", y: "78%", s: "3px",   dur: "7.8s",  delay: "3.1s" },
  { x: "46%", y: "90%", s: "2px",   dur: "9.6s",  delay: "1.9s" },
  { x: "54%", y: "68%", s: "2.5px", dur: "8.6s",  delay: "0.5s" },
  { x: "61%", y: "86%", s: "1.5px", dur: "11s",   delay: "2.2s" },
  { x: "68%", y: "75%", s: "3px",   dur: "7.2s",  delay: "3.6s" },
  { x: "75%", y: "92%", s: "2px",   dur: "9.9s",  delay: "1.1s" },
  { x: "82%", y: "66%", s: "2.5px", dur: "8.4s",  delay: "2.9s" },
  { x: "89%", y: "84%", s: "1.5px", dur: "10.8s", delay: "0.3s" },
  { x: "94%", y: "70%", s: "2px",   dur: "8.9s",  delay: "4.0s" },
  { x: "13%", y: "58%", s: "1.5px", dur: "11.4s", delay: "3.3s" },
  { x: "50%", y: "96%", s: "2.5px", dur: "7.9s",  delay: "2.5s" },
  { x: "71%", y: "60%", s: "2px",   dur: "10.1s", delay: "1.6s" },
];

/** Beat boundaries, in ms from mount. */
const T_WORD = 950;
const T_TAG = 1950;
const T_EXIT = 3150;
const T_UNMOUNT = T_EXIT + 950; // must match the exit animation duration in CSS

export default function IntroCinematic({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"mark" | "word" | "tag">("mark");
  const [exiting, setExiting] = useState(false);
  // Guards against a double-finish (e.g. a click landing on the same tick the
  // auto-timer fires), which would otherwise queue two unmount callbacks.
  const finishing = useRef(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("word"), T_WORD),
      setTimeout(() => setPhase("tag"), T_TAG),
      setTimeout(() => finish(), T_EXIT),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setExiting(true);
    setTimeout(onDone, T_UNMOUNT - T_EXIT);
  }

  const wordIn = phase === "word" || phase === "tag";
  const tagIn = phase === "tag";

  return (
    <div
      className={`vx-intro-stage ${exiting ? "vx-intro-exit" : ""}`}
      role="presentation"
      onClick={finish}
    >
      <div className="vx-intro-bloom" aria-hidden />
      <div className="vx-intro-rays" aria-hidden />

      <div className="vx-intro-particles" aria-hidden>
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="vx-intro-dot"
            style={
              {
                "--px": p.x,
                "--py": p.y,
                "--ps": p.s,
                "--pdur": p.dur,
                "--pdelay": p.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="vx-intro-beam" aria-hidden />

      <div className="vx-intro-center">
        <div className={`vx-intro-mark ${wordIn ? "vx-intro-mark--settled" : ""}`}>
          <span className="vx-intro-halo" aria-hidden />
          <span className="vx-intro-shock" aria-hidden />
          <span className="vx-intro-shock vx-intro-shock--2" aria-hidden />
          <Image
            src="/logo-mark.png"
            alt=""
            width={92}
            height={92}
            priority
            className="vx-intro-mark-img"
          />
        </div>

        <h1
          className={`vx-intro-word ${wordIn ? "vx-intro-word--in" : ""}`}
          aria-label={WORDMARK}
        >
          {WORDMARK.split("").map((ch, i) => (
            <span
              key={i}
              className={`vx-intro-letter${ch === " " ? " vx-intro-letter--space" : ""}`}
              style={{ ["--li" as any]: i }}
              aria-hidden
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </h1>

        <span className={`vx-intro-rule ${tagIn ? "vx-intro-rule--in" : ""}`} aria-hidden />

        <p className={`vx-intro-tag ${tagIn ? "vx-intro-tag--in" : ""}`}>
          Every deadline, one clear picture.
        </p>
      </div>

      <div className="vx-intro-flash" aria-hidden />

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); finish(); }}
        className="vx-intro-skip"
        aria-label="Skip intro"
      >
        Skip
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5l6 7-6 7M13 5l6 7-6 7" />
        </svg>
      </button>
    </div>
  );
}
