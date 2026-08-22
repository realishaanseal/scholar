"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

/**
 * Capture token for the browser extension.
 *
 * Shown masked by default. Rotating invalidates the old token immediately,
 * which is the recovery path if it ever leaks — worth stating plainly, since a
 * token the student can't revoke is worse than no token at all.
 */
export default function ExtensionSetup() {
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchJson<{ token: string }>("/api/settings/capture-token").then(({ data }) => {
      if (data?.token) setToken(data.token);
    });
  }, []);

  async function rotate() {
    setBusy(true);
    const { data } = await fetchJson<{ token: string }>("/api/settings/capture-token", { method: "POST" });
    setBusy(false);
    if (data?.token) {
      setToken(data.token);
      setRevealed(true);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some contexts; revealing lets them copy by hand.
      setRevealed(true);
    }
  }

  const masked = token ? `${token.slice(0, 8)}${"•".repeat(18)}` : "";

  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Browser extension</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Highlight an assignment on any page, right-click, and send it here. Paste this token
        into the extension once to connect it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-[12px] text-slate-300">
          {token ? (revealed ? token : masked) : "…"}
        </code>
        <button className="btn-ghost shrink-0 px-3 py-2.5 text-xs" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Hide" : "Show"}
        </button>
        <button className="btn-primary shrink-0 px-4 py-2.5 text-xs" onClick={copy} disabled={!token}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-[11px] text-slate-600">
          Treat it like a password — anyone with it can add homework to your account.
        </p>
        <button className="btn-ghost ml-auto shrink-0 px-3 py-2 text-xs" onClick={rotate} disabled={busy}>
          {busy ? "Rotating…" : "Rotate token"}
        </button>
      </div>

      <details className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
        <summary className="cursor-pointer text-[12px] text-slate-300">How to install it</summary>
        <ol className="mt-2.5 list-decimal space-y-1.5 pl-4 text-[11.5px] leading-relaxed text-slate-500">
          <li>Unzip the extension folder somewhere you&apos;ll keep it.</li>
          <li>Open <code className="text-slate-400">chrome://extensions</code> and turn on Developer mode.</li>
          <li>Click &ldquo;Load unpacked&rdquo; and pick that folder.</li>
          <li>Click the Scholar icon, paste the token above, and you&apos;re set.</li>
        </ol>
      </details>
    </section>
  );
}
