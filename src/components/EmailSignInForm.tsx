"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";

export default function EmailSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);

    if (res?.error) {
      setError("That email and password combination doesn't match an account.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input" placeholder="you@school.edu" autoComplete="email" />
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input" placeholder="••••••••" autoComplete="current-password" />
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.button
        type="submit"
        disabled={busy}
        className="btn-primary w-full py-3"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={SPRING}
      >
        {busy ? "Signing in…" : "Sign in"}
      </motion.button>
    </form>
  );
}
