"use client";

import { useState } from "react";
import IntroCinematic from "./IntroCinematic";
import LandingPage from "./landing/LandingPage";

/**
 * Wraps the signed-out landing page. The real page renders underneath from
 * the very first paint (so there's zero layout shift at handoff) but holds
 * its own entrance animation until the cinematic intro begins its
 * push-through exit — `revealed` flips then, so the landing rises into view
 * during the dissolve and the two read as one continuous move. There's
 * deliberately no sessionStorage/cookie flag: the intro replays on every
 * refresh while signed out, which a server component already guarantees by
 * only ever rendering this gate for signed-out sessions.
 */
export default function HomeIntroGate() {
  const [showIntro, setShowIntro] = useState(true);
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      <LandingPage revealed={revealed || !showIntro} />
      {showIntro && (
        <IntroCinematic
          onExitStart={() => setRevealed(true)}
          onDone={() => setShowIntro(false)}
        />
      )}
    </>
  );
}
