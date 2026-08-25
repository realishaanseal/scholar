"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { fetchJson } from "@/lib/fetchJson";
import { ICONS, PROVIDER_NAMES } from "./OAuthButtons";

type Profile = {
  id: string; name: string | null; email: string | null; createdAt: string;
  products: Array<{ id: string; label: string; active: boolean }>;
};

type SignInMethods = {
  oauth: Array<{ provider: string; providerAccountId: string }>;
  hasPassword: boolean;
};

const OAUTH_PROVIDER_IDS = ["google", "github"] as const;

/**
 * Account, export and deletion.
 *
 * Export and delete sit here rather than in a policy page because they're the
 * operative half of "your data belongs to you" — a claim that means nothing if
 * acting on it requires emailing someone.
 */
export default function AccountPanel({
  name,
  email,
  enabledOAuthProviders,
}: {
  name: string | null;
  email: string | null;
  enabledOAuthProviders: { google: boolean; github: boolean };
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signInMethods, setSignInMethods] = useState<SignInMethods | null>(null);
  const [displayName, setDisplayName] = useState(name ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ profile: Profile; signIn: SignInMethods }>("/api/account").then(({ data }) => {
      if (data?.profile) {
        setProfile(data.profile);
        setDisplayName(data.profile.name ?? "");
      }
      if (data?.signIn) setSignInMethods(data.signIn);
    });
  }, []);

  async function unlink(provider: string) {
    setUnlinkError(null);
    setUnlinkBusy(provider);
    const { ok, data, error } = await fetchJson<{ signIn: SignInMethods }>("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setUnlinkBusy(null);
    if (ok && data?.signIn) {
      setSignInMethods(data.signIn);
    } else {
      setUnlinkError(error ?? "Couldn't unlink that provider.");
    }
  }

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
        <h3 className="text-sm font-semibold text-white">Sign-in methods</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          What you can use to get into this account. Signing in linked more than one automatically
          when the same email address matched.
        </p>

        {!signInMethods ? (
          <div className="mt-4 space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton-shimmer h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {signInMethods.hasPassword && (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-slate-200">Email and password</span>
              </div>
            )}

            {OAUTH_PROVIDER_IDS.filter((p) => signInMethods.oauth.some((a) => a.provider === p)).map((p) => (
              <div
                key={p}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04]">
                  {ICONS[p]}
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-slate-200">{PROVIDER_NAMES[p]}</span>
                <button
                  className="btn-ghost shrink-0 px-3 py-1.5 text-[11px] text-slate-400 hover:text-rose-300"
                  disabled={unlinkBusy === p}
                  onClick={() => unlink(p)}
                >
                  {unlinkBusy === p ? "Unlinking…" : "Unlink"}
                </button>
              </div>
            ))}

            {OAUTH_PROVIDER_IDS.filter(
              (p) => enabledOAuthProviders[p] && !signInMethods.oauth.some((a) => a.provider === p)
            ).map((p) => (
              <div
                key={p}
                className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.08] p-3.5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.02] opacity-60">
                  {ICONS[p]}
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-slate-500">
                  {PROVIDER_NAMES[p]} isn&apos;t linked
                </span>
                <span className="shrink-0 text-[11px] text-slate-600">
                  Sign out, then sign in with {PROVIDER_NAMES[p]} using this email to link it
                </span>
              </div>
            ))}
          </div>
        )}

        {unlinkError && <p className="mt-3 text-[11px] text-rose-300">{unlinkError}</p>}
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
