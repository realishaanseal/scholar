"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { fetchJson } from "@/lib/fetchJson";

type Profile = {
  id: string; name: string | null; email: string | null; createdAt: string;
  products: Array<{ id: string; label: string; active: boolean }>;
};

/**
 * Account, export and deletion.
 *
 * Export and delete sit here rather than in a policy page because they're the
 * operative half of "your data belongs to you" — a claim that means nothing if
 * acting on it requires emailing someone.
 */
export default function AccountPanel({ name, email }: { name: string | null; email: string | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState(name ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ profile: Profile }>("/api/account").then(({ data }) => {
      if (data?.profile) {
        setProfile(data.profile);
        setDisplayName(data.profile.name ?? "");
      }
    });
  }, []);

  async function saveName() {
    const { ok } = await fetchJson("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    });
    if (ok) {
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1600);
    }
  }

  async function remove() {
    setError(null);
    const { ok, error } = await fetchJson("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: confirmText }),
    });

    if (ok) {
      // Nothing left to come back to, so end the session rather than leaving
      // the app pointing at rows that no longer exist.
      signOut({ callbackUrl: "/" });
    } else {
      setError(error ?? "Couldn't delete the account.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Varaxis ID</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              One account for Varaxis products. Scholar is the first — others will sign in with
              this same identity rather than asking you to start again.
            </p>
          </div>
          {status && <span className="shrink-0 text-[11px] text-emerald-300">{status}</span>}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Display name</label>
            <div className="mt-1 flex gap-2">
              <input
                className="input py-2 text-[13px]"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={saveName}
              />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <div className="mt-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[13px] text-slate-400">
              {email ?? "—"}
            </div>
          </div>
        </div>

        {profile && (
          <div className="mt-5">
            <label className="label">Products</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {profile.products.map((p) => (
                <span
                  key={p.id}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-slate-300"
                >
                  {p.label}
                </span>
              ))}
              <span className="rounded-lg border border-dashed border-white/[0.07] px-3 py-1.5 text-[11.5px] text-slate-600">
                More coming
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Your data</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Everything Scholar holds lives in a database file on this machine. Nothing is sent
          anywhere except the AI provider you configured, and only when you ask it to read something.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="min-w-0">
            <p className="text-[13px] text-slate-200">Export everything</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              All your homework, history, subjects and settings as a JSON file. Encrypted API keys
              and attachment contents are left out on purpose.
            </p>
          </div>
          <a href="/api/account?export=1" download className="btn-ghost ml-auto shrink-0 px-4 py-2 text-xs">
            Download
          </a>
        </div>
      </section>

      <section className="card animate-riseIn border-red-500/15 p-6">
        <h3 className="text-sm font-semibold text-white">Delete account</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Permanently removes your homework, history, groups you own, and every share you&apos;ve
          created. This cannot be undone and there is no backup.
        </p>

        {!confirmDelete ? (
          <button
            className="btn-ghost mt-4 px-3 py-2 text-xs text-red-300/80 hover:text-red-300"
            onClick={() => setConfirmDelete(true)}
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
            <label className="label">
              Type <span className="font-mono text-red-300">{email}</span> to confirm
            </label>
            <input
              className="input mt-1.5 py-2 text-[13px]"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              spellCheck={false}
            />

            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

            <div className="mt-3 flex gap-2">
              <button
                className="btn-danger px-4 py-2 text-xs"
                disabled={confirmText.trim().toLowerCase() !== (email ?? "").toLowerCase()}
                onClick={remove}
              >
                Delete permanently
              </button>
              <button
                className="btn-ghost px-3 py-2 text-xs"
                onClick={() => { setConfirmDelete(false); setConfirmText(""); setError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
