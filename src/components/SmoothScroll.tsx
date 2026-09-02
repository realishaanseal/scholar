"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Kinetic scrolling, scoped deliberately.
 *
 * Lenis intercepts the wheel and animates scroll position itself, which reads
 * as expensive and considered on a page someone is *reading*. On a page
 * someone is *working* in it reads as lag: a dashboard where you flick to a
 * task and the list keeps gliding past it costs you the thing you were
 * reaching for. So this mounts on the marketing and landing surfaces rather
 * than in the root layout, and the app shell keeps native scrolling.
 *
 * Two behaviours are non-negotiable:
 *
 *   Reduced motion   — someone who has asked their OS to stop animations has
 *                      often done so because motion makes them ill. Smoothed
 *                      scrolling is exactly the kind that does it, so this
 *                      never initialises at all rather than merely shortening
 *                      the duration.
 *   Native touch     — syncTouch is left off. Phones already have momentum
 *                      scrolling tuned by the platform, and replacing it with
 *                      a JavaScript approximation is a downgrade every time.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const lenis = new Lenis({
      // Roughly a second to settle: long enough to read as weight, short
      // enough that a deliberate scroll still feels answered.
      duration: 1.05,
      // Exponential ease-out. The default is close to this; it is spelled out
      // because the feel of the whole page hangs on this one curve.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Anchor links and scrollIntoView should still work normally.
      anchors: true,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // If the preference changes mid-session, stop immediately rather than
    // waiting for a navigation.
    const onPreferenceChange = (e: MediaQueryListEvent) => {
      if (e.matches) lenis.stop();
      else lenis.start();
    };
    reduced.addEventListener("change", onPreferenceChange);

    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", onPreferenceChange);
      lenis.destroy();
    };
  }, []);

  return null;
}
