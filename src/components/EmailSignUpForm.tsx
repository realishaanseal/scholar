"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";

export default function EmailSignUpForm({ intent }: { intent?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, intent }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (!signInResult || signInResult.error) {
      // The account was created successfully — only the immediate auto-login
      // failed. Send them to sign in manually instead of bouncing them at
      // /dashboard with no explanation of what went wrong.
      setBusy(false);
      setError("Account created — sign in below to continue.");
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" required value={form.name} onChange={set("name")}
          className="input" placeholder="Ishaan Seal" autoComplete="name" />
      </div>

      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required value={form.email} onChange={set("email")}
          className="input" placeholder="you@school.edu" autoComplete="email" />
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8}
          value={form.password} onChange={set("password")}
          className="input" placeholder="At least 8 characters" autoComplete="new-password" />
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
        {busy ? "Creating account…" : "Create account"}
      </motion.button>
    </form>
  );
}
