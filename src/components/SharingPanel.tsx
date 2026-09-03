"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type Scope = { id: string; label: string; explains: string };
type Grant = {
  id: string; scopes: string[]; label: string; createdAt: string;
  expiresAt: string | null; revokedAt: string | null;
  viewerUserId: string | null; inviteCode: string | null; subjectName?: string;
};

const NEVER_SHARED = [
  "Task details and personal notes",
  "Attachments and uploaded files",
  "Study coach conversations",
  "API keys and account credentials",
];

/**
 * Sharing — the parent/guardian feature, framed from the student's side.
 *
 * The whole screen is built around the student deciding what leaves their
 * account. Scopes state plainly what each one exposes, the "never shared" list
 * is shown alongside rather than buried in a policy, and revoking is one click
 * with no confirmation step — friction on revoke would be friction in the
 * wrong direction.
 */
export default function SharingPanel() {
  const [issued, setIssued] = useState<Grant[]>([]);
  const [received, setReceived] = useState<Grant[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);

  async function load() {
    const { data } = await fetchJson<{ issued: Grant[]; received: Grant[]; availableScopes: Scope[] }>(
      "/api/sharing"
    );
    if (data) {
      setIssued(data.issued);
      setReceived(data.received);
      setScopes(data.availableScopes);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="card skeleton-shimmer h-[320px]" />;
  if (viewing) return <SharedView grantId={viewing} onBack={() => setViewing(null)} />;

  const active = issued.filter((g) => !g.revokedAt);

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Share with a parent or guardian</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          You choose exactly what they can see, and you can stop it at any time. They never get
          access to your account — only to the summary you pick.
        </p>

        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
          <p className="text-[11.5px] font-medium text-emerald-300">Never shared, whatever you pick</p>
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {NEVER_SHARED.map((item) => (
              <li key={item} className="text-[11.5px] leading-snug text-slate-400">· {item}</li>
            ))}
          </ul>
        </div>

        {active.length > 0 && (
          <div className="mt-5 space-y-2">
            {active.map((g) => (
              <div key={g.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-slate-200">{g.label}</span>
                      {!g.viewerUserId && (
                        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
                          Not accepted yet
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      Can see: {g.scopes.map((s) => scopes.find((x) => x.id === s)?.label ?? s).join(", ")}
                      {g.expiresAt && ` · until ${new Date(g.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>

                  <button
      type="button"
      className="shrink-0 text-[11.5px] text-red-300/80 hover:text-red-300"
                    onClick={async () => {
                      await fetchJson(`/api/sharing?id=${g.id}`, { method: "DELETE" });
                      load();
                    }}
                  >
                    Stop sharing
                  </button>
                </div>

                {g.inviteCode && (
                  <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      Give them this code
                    </div>
                    <div className="mt-0.5 font-mono text-[16px] tracking-[0.22em] text-white">
                      {g.inviteCode}
                    </div>
                    <p className="mt-1 text-[10.5px] text-slate-600">
                      Works once. After they use it, the code stops working.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <CreateGrant scopes={scopes} onDone={load} />
      </section>

      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Shared with you</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Summaries other people have chosen to share. They can stop at any time.
        </p>

        {received.filter((g) => !g.revokedAt).length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-slate-500">
            Nothing shared with you yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {received.filter((g) => !g.revokedAt).map((g) => (
              <button
      type="button"
      key={g.id}
                onClick={() => setViewing(g.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02]
                           px-4 py-3 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-slate-200">{g.subjectName}</span>
                  <span className="block text-[11px] text-slate-500">
                    {g.scopes.map((s) => scopes.find((x) => x.id === s)?.label ?? s).join(", ")}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        )}

        <AcceptCode onDone={load} />
      </section>
    </div>
  );
}

function CreateGrant({ scopes, onDone }: { scopes: Scope[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(["workload-summary"]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-ghost mt-5 px-3 py-2 text-xs" onClick={() => setOpen(true)}>
        Share a summary
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <label className="label">Who is this for?</label>
      <input
        className="input mt-1 py-2.5 text-[13px]"
        placeholder="e.g. Mum, Dad, my tutor"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        autoFocus
      />

      <label className="label mt-4 block">What can they see?</label>
      <div className="mt-1.5 space-y-1.5">
        {scopes.map((s) => {
          const on = picked.has(s.id);
          return (
            <label
              key={s.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              style={{
                borderColor: on ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                background: on ? "rgba(255,255,255,0.04)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-vx-500"
                checked={on}
                onChange={(e) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    e.target.checked ? next.add(s.id) : next.delete(s.id);
                    return next;
                  })
                }
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-200">{s.label}</span>
                <span className="block text-[11px] leading-snug text-slate-500">{s.explains}</span>
              </span>
            </label>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
      type="button"
      className="btn-primary px-4 py-2 text-xs"
          disabled={busy || label.trim().length < 1 || picked.size === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const { ok, error } = await fetchJson("/api/sharing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create", label, scopes: [...picked] }),
            });
            setBusy(false);
            if (ok) { setOpen(false); setLabel(""); onDone(); }
            else setError(error ?? "Couldn't create that.");
          }}
        >
          Create invite
        </button>
        <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function AcceptCode({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <input
        className="input flex-1 py-2 font-mono text-[13px] uppercase tracking-widest"
        placeholder="Enter an invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <button
      type="button"
      className="btn-ghost shrink-0 px-4 py-2 text-xs"
        disabled={code.trim().length < 4}
        onClick={async () => {
          setError(null);
          const { ok, error } = await fetchJson("/api/sharing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "accept", code }),
          });
          if (ok) { setCode(""); onDone(); }
          else setError(error ?? "That code didn't work.");
        }}
      >
        Accept
      </button>
      {error && <p className="w-full text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

/** Read-only view of what someone shared. Renders only the scopes granted. */
function SharedView({ grantId, onBack }: { grantId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<any>(`/api/sharing/${grantId}`).then(({ ok, data, error }) => {
      if (ok) setData(data);
      else setError(error ?? "That share is no longer available.");
    });
  }, [grantId]);

  if (error) {
    return (
      <section className="card animate-riseIn p-6">
        <button type="button" onClick={onBack} className="mb-4 text-[11px] text-slate-500 hover:text-slate-300">← Back</button>
        <p className="text-sm text-slate-400">{error}</p>
      </section>
    );
  }

  if (!data) return <div className="card skeleton-shimmer h-[260px]" />;

  const { views, grant } = data;

  return (
    <section className="card animate-riseIn p-6">
      <button type="button" onClick={onBack} className="mb-4 text-[11px] text-slate-500 hover:text-slate-300">← Back</button>
      <h3 className="text-lg font-semibold tracking-tight text-white">{grant.subjectName}</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">Shared with you · read only</p>

      {views.workload && (
        <div className="mt-5">
          <h4 className="text-[13px] font-medium text-white">Workload</h4>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Open" value={String(views.workload.openCount)} />
            <Stat label="Overdue" value={String(views.workload.overdueCount)} tone={views.workload.overdueCount > 0 ? "#ef4444" : undefined} />
            <Stat label="Due this week" value={String(views.workload.dueThisWeek)} />
            <Stat label="Est. hours" value={`${views.workload.estimatedHours}h`} />
          </div>
          <p className="mt-2.5 text-[12.5px] text-slate-400">{views.workload.headline}</p>
        </div>
      )}

      {views.deadlines && (
        <div className="mt-6">
          <h4 className="text-[13px] font-medium text-white">Upcoming deadlines</h4>
          {views.deadlines.items.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nothing due in the next two weeks.</p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {views.deadlines.items.map((i: any, n: number) => (
                <div key={n} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3.5 py-2">
                  <span className="flex-1 text-[13px] text-slate-300">{i.subject}</span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(i.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  <span className={`text-[11px] ${i.done ? "text-emerald-300" : "text-slate-600"}`}>
                    {i.done ? "Done" : "Open"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {views.progress && (
        <div className="mt-6">
          <h4 className="text-[13px] font-medium text-white">Progress</h4>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Stat label="On time" value={`${Math.round(views.progress.onTimeRate * 100)}%`} />
            <Stat label="Completed" value={String(views.progress.totalSessions)} />
          </div>
        </div>
      )}

      <p className="mt-6 border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-slate-600">
        This is a summary only. Task details, notes, attachments and coach conversations are never
        shared, and {grant.subjectName} can stop sharing at any time.
      </p>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-center">
      <div className="text-lg font-semibold tabular-nums" style={{ color: tone ?? "#fff" }}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}
