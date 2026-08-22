"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EmailSignUpForm() {
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
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }

    await signIn("credentials", { email: form.email, password: form.password, redirect: false });
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

      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full py-3">
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
