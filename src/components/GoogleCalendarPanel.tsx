"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";

type Status = {
  configured: boolean;
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  expectedRedirectUri: string | null;
  redirectUriError: string | null;
};

/**
 * Google Calendar two-way sync.
 *
 * Deliberately scoped: assignments pushed here create the Google event, and
 * edits/deletions made to THAT event on the Google side flow back — but an
 * unrelated event already on the student's calendar is never pulled in as
 * homework. See googleSync.ts for the full reasoning; the note here is the
 * short version so it isn't a silent surprise.
 */
export default function GoogleCalendarPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [copied, setCopied] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  async function load() {
    const { data } = await fetchJson<Status>("/api/calendar/google/status");
    if (data) setStatus(data);
  }

  useEffect(() => {
    load();
  }, []);

  // The OAuth callback redirects back here with ?calendar=connected|error —
  // surface that once, then scrub it from the URL so a refresh doesn't
  // re-show a stale result.
  useEffect(() => {
    const result = searchParams.get("calendar");
    if (!result) return;

    if (result === "connected") {
      setSyncResult("Connected. Doing a first sync…");
      load().then(() => sync("manual"));
    } else if (result === "error") {
      setError(searchParams.get("calendarError") ?? "Couldn't connect Google Calendar.");
    }

    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, not on every param/router identity change
  }, []);

  async function sync(trigger: "manual" | "auto") {
    setSyncing(true);
    setError(null);
    const { ok, data, error } = await fetchJson<{
      skipped?: boolean; created?: number; updated?: number; removed?: number;
      pushed?: { created: number; updated: number; removed: number };
      pulled?: { updated: number; removed: number };
    }>("/api/calendar/google/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger }),
    });
    setSyncing(false);

    if (!ok) {
      setError(error ?? "Sync failed.");
      return;
    }
    if (data?.skipped) {
      setSyncResult("Already synced recently.");
    } else if (data?.pushed || data?.pulled) {
      const parts = [];
      if (data.pushed) parts.push(`${data.pushed.created} added, ${data.pushed.updated} updated on Google`);
      if (data.pulled) parts.push(`${data.pulled.updated} updated from Google`);
      setSyncResult(parts.join(" · ") || "Synced — nothing to change.");
    }
    await load();
    setTimeout(() => setSyncResult(null), 5000);
  }

  async function disconnect() {
    setSyncing(true);
    const { ok, error } = await fetchJson("/api/calendar/google/disconnect", { method: "POST" });
    setSyncing(false);
    setConfirmDisconnect(false);
    if (ok) {
      await load();
    } else {
      setError(error ?? "Couldn't disconnect.");
    }
  }

  if (!status) {
    return <div className="skeleton-shimmer mt-2.5 h-[86px] rounded-xl" />;
  }

  if (!status.configured) {
    return (
      <div className="mt-2.5 rounded-xl border border-white/[0.05] bg-white/[0.012] p-4 opacity-70">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-slate-400">Google Calendar</span>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Not configured
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
          This deployment hasn&apos;t set up Google sign-in credentials yet — Google Calendar sync reuses
          them. See SETUP.md.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-200">Google Calendar</span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                status.connected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-slate-500"
              }`}
            >
              {status.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
            {status.connected
              ? status.lastSyncedAt
                ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
                : "Connected — not synced yet."
              : "Two-way sync: assignments appear on your calendar, and edits to those events sync back."}
          </p>
        </div>

        {status.connected ? (
          <div className="flex shrink-0 gap-2">
            <button className="btn-ghost px-3.5 py-2 text-xs" onClick={() => sync("manual")} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            {!confirmDisconnect ? (
              <button
                className="btn-ghost px-3.5 py-2 text-xs text-rose-300/80 hover:text-rose-300"
                onClick={() => setConfirmDisconnect(true)}
              >
                Disconnect
              </button>
            ) : (
              <>
                <button className="btn-danger px-3.5 py-2 text-xs" onClick={disconnect} disabled={syncing}>
                  Confirm
                </button>
                <button className="btn-ghost px-3.5 py-2 text-xs" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : (
          <a href="/api/calendar/google/connect" className="btn-primary shrink-0 px-4 py-2 text-xs">
            Connect
          </a>
        )}
      </div>

      {syncResult && <p className="mt-2.5 text-[11px] text-emerald-300">{syncResult}</p>}
      {(error || status.lastSyncError) && (
        <p className="mt-2.5 text-[11px] text-rose-300">{error ?? status.lastSyncError}</p>
      )}

      {/* "redirect_uri_mismatch" happens entirely on Google's side, before it
          ever redirects back here — so the only fix is making sure this exact
          string is registered as a redirect URI on the OAuth client in the
          Google Cloud Console, alongside the one sign-in already uses. */}
      {!status.connected && (error || status.expectedRedirectUri || status.redirectUriError) && (
        <div className="mt-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          {status.redirectUriError ? (
            <p className="text-[11px] leading-relaxed text-amber-300/90">{status.redirectUriError}</p>
          ) : status.expectedRedirectUri ? (
            <>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Getting &ldquo;redirect_uri_mismatch&rdquo;? Add this exact URL as an{" "}
                <span className="text-slate-300">Authorised redirect URI</span> on the same Google
                OAuth client used for sign-in, in the{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-slate-300"
                >
                  Google Cloud Console
                </a>
                :
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                  {status.expectedRedirectUri}
                </code>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2.5 py-1.5 text-[11px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(status.expectedRedirectUri!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    } catch {
                      /* Clipboard blocked — the field above is still selectable by hand. */
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
