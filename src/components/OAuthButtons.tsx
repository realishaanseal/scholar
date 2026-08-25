"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

type Props = {
  enabled: { google: boolean; github: boolean };
};

export const ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l4-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l4 3.09C6.23 6.86 8.88 4.75 12 4.75z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  ),
};

export const LABELS: Record<string, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

export const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

export default function OAuthButtons({ enabled }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const active = (Object.keys(enabled) as Array<keyof Props["enabled"]>).filter((k) => enabled[k]);

  if (active.length === 0) {
    return (
      <div className="animate-riseIn rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3.5 text-xs leading-relaxed text-amber-200/90">
        <span className="font-medium">One-tap sign-in is not configured yet.</span> Add your
        Google / GitHub client IDs to <code className="font-mono">.env.local</code> and
        restart — the buttons appear here automatically. See{" "}
        <code className="font-mono">SETUP.md</code>. Email sign-in below works right now.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {active.map((p, i) => (
        <button
          key={p}
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setBusy(p);
            signIn(p, { callbackUrl: "/dashboard" });
          }}
          className="btn-oauth animate-riseIn stagger"
          style={{ ["--i" as any]: i }}
        >
          {ICONS[p]}
          <span>{busy === p ? "Redirecting…" : LABELS[p]}</span>
        </button>
      ))}
    </div>
  );
}
