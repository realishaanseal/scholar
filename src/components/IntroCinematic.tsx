"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * A short cinematic intro shown over the landing page for signed-out
 * visitors. By design it has no persistence (no sessionStorage / cookie) —
 * the request was for it to replay on every refresh while logged out, so
 * the only "memory" here is within a single mount.
 *
 * Structure: mark draws in with a tracing glow → wordmark resolves letter
 * by letter → tagline → the whole stage wipes away with an iris-style
 * reveal of the real page underneath, which mounted (invisible) the whole
 * time so there's no layout jank at handoff.
 *
 * Skippable at any time via click, tap, Enter/Escape, or a "Skip" control —
 * a good cinematic touch is still an obstacle if it can't be gotten out of
 * the way quickly, especially for a returning visitor bouncing between tabs.
 */

const WORDMARK = "Varaxis Scholar";

export default function IntroCinematic({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"mark" | "word" | "tag" | "wipe">("mark");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("word"), 900);
    const t2 = setTimeout(() => setPhase("tag"), 1900);
    const t3 = setTimeout(() => finish(), 3300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    setClosing(true);
    setPhase("wipe");
    // Match the wipe transition duration below before unmounting for good.
    setTimeout(onDone, 720);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`vx-intro-stage ${closing ? "vx-intro-wipe" : ""}`}
      role="presentation"
      onClick={finish}
    >
      <div className="vx-intro-veil" aria-hidden />
      <div className="vx-intro-rays" aria-hidden />

      <div className="vx-intro-center">
        <div className={`vx-intro-mark ${phase !== "mark" ? "vx-intro-mark--settled" : ""}`}>
          <span className="vx-intro-ring" aria-hidden />
          <Image
            src="/logo-mark.png"
            alt=""
            width={84}
            height={84}
            priority
            className="vx-intro-mark-img"
          />
        </div>

        <h1
          className={`vx-intro-word ${
            phase === "word" || phase === "tag" || closing ? "vx-intro-word--in" : ""
          }`}
          aria-label={WORDMARK}
        >
          {WORDMARK.split("").map((ch, i) => (
            <span
              key={i}
              className={`vx-intro-letter${ch === " " ? " vx-intro-letter--space" : ""}`}
              style={{ ["--li" as any]: i, animationDelay: `${i * 26}ms` }}
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </h1>

        <p className={`vx-intro-tag ${phase === "tag" || closing ? "vx-intro-tag--in" : ""}`}>
          Every deadline, one clear picture.
        </p>
      </div>

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
