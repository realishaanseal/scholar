"use client";

import { useState } from "react";
import IntroCinematic from "./IntroCinematic";

/**
 * Wraps the signed-out landing page. The real page renders underneath from
 * the very first paint (so there's zero layout shift at handoff) while the
 * cinematic intro plays on top of it; once it finishes (or is skipped) it
 * unmounts and never comes back for this page load. There's deliberately no
 * sessionStorage/cookie flag — the ask was for it to replay every refresh
 * whenever the visitor is signed out, which a server component already
 * guarantees by only ever rendering this gate for signed-out sessions.
 */
export default function HomeIntroGate({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <>
      {children}
      {showIntro && <IntroCinematic onDone={() => setShowIntro(false)} />}
    </>
  );
}
