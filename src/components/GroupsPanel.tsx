"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type Group = {
  id: string; kind: string; name: string; subjectName: string | null;
  ownerUserId: string; joinCode: string | null; role: string; memberCount: number;
};

type GroupTask = {
  id: string; title: string; details: string; subjectName: string | null;
  dueAt: string | null; assignedTo: string | null; createdBy: string; createdAt: string;
};

type Member = { userId: string; role: string; name: string | null; email: string | null };
type Comment = { id: string; userId: string; body: string; createdAt: string; name: string | null };

/**
 * Study groups and courses.
 *
 * A group is a separate shared board, not a window into anyone's private list.
 * Posting to a group copies work in deliberately — nothing a student adds to
 * their own homework is ever visible to a group they're in.
 */
export default function GroupsPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    group: Group; tasks: GroupTask[]; members: Member[]; comments: Comment[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await fetchJson<{ groups: Group[] }>("/api/groups");
    if (data) setGroups(data.groups);
    setLoading(false);
  }

  async function openGroup(id: string) {
    setOpenId(id);
    setDetail(null);
    const { data, error } = await fetchJson<any>(`/api/groups/${id}`);
    if (data) setDetail(data);
    else setError(error ?? "Couldn't open that group.");
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="card skeleton-shimmer h-[280px]" />;

  if (openId && detail) {
    return (
      <GroupDetail
        detail={detail}
        onBack={() => { setOpenId(null); setDetail(null); load(); }}
        onChanged={() => openGroup(openId)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <h3 className="text-sm font-semibold text-white">Study groups</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          A shared board for group projects and revision. Your own homework stays private —
          only what you post here is visible to the group.
        </p>

        {groups.length > 0 && (
          <div className="mt-5 space-y-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => openGroup(g.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02]
                           px-4 py-3 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-slate-200">{g.name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {g.kind === "course" ? "Course" : "Study group"} · {g.memberCount} member
                    {g.memberCount === 1 ? "" : "s"} · you&apos;re {g.role === "owner" ? "the owner" : `a ${g.role}`}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <CreateOrJoin onDone={load} />
      </section>
    </div>
  );
}

function CreateOrJoin({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const body =
      mode === "create"
        ? { action: "create", name, kind: "study-group" }
        : { action: "join", code };

    const { ok, error } = await fetchJson("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (ok) { setMode("none"); setName(""); setCode(""); onDone(); }
    else setError(error ?? "That didn't work.");
  }

  if (mode === "none") {
    return (
      <div className="mt-5 flex gap-2">
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setMode("create")}>
          New group
        </button>
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setMode("join")}>
          Join with a code
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      {mode === "create" ? (
        <input
          className="input py-2.5 text-[13px]"
          placeholder="e.g. Physics revision"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      ) : (
        <input
          className="input py-2.5 font-mono text-[13px] uppercase tracking-widest"
          placeholder="ABC1234"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
        />
      )}

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary px-4 py-2 text-xs"
          onClick={submit}
          disabled={busy || (mode === "create" ? name.trim().length < 1 : code.trim().length < 4)}
        >
          {mode === "create" ? "Create" : "Join"}
        </button>
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => { setMode("none"); setError(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function GroupDetail({
  detail, onBack, onChanged,
}: {
  detail: { group: Group; tasks: GroupTask[]; members: Member[]; comments: Comment[] };
  onBack: () => void;
  onChanged: () => void;
}) {
  const { group, tasks, members, comments } = detail;
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOwner = group.role === "owner" || group.role === "teacher";

  async function post(body: Record<string, unknown>) {
    setError(null);
    const { ok, error } = await fetchJson(`/api/groups/${group.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (ok) onChanged();
    else setError(error ?? "That didn't work.");
  }

  return (
    <div className="space-y-5">
      <section className="card animate-riseIn p-6">
        <button onClick={onBack} className="mb-4 text-[11px] text-slate-500 hover:text-slate-300">
          ← All groups
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-white">{group.name}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {members.length} member{members.length === 1 ? "" : "s"}
              {members.map((m) => m.name || m.email?.split("@")[0]).filter(Boolean).length > 0 &&
                ` · ${members.map((m) => m.name || m.email?.split("@")[0]).join(", ")}`}
            </p>
          </div>

          {group.joinCode && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Join code</div>
              <div className="font-mono text-[15px] tracking-[0.2em] text-white">{group.joinCode}</div>
              {isOwner && (
                <button
                  className="mt-1 text-[10.5px] text-slate-500 hover:text-slate-300"
                  onClick={() => post({ action: "rotate-code" })}
                >
                  Change code
                </button>
              )}
            </div>
          )}
        </div>

        {/* Shared work */}
        <div className="mt-6">
          <h4 className="text-[13px] font-medium text-white">Shared work</h4>

          {tasks.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-slate-500">
              Nothing posted yet.
            </p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-200">{t.title}</span>
                    <span className="block text-[11px] text-slate-600">
                      {t.dueAt
                        ? new Date(t.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                        : "No deadline"}
                      {t.assignedTo && ` · assigned to ${members.find((m) => m.userId === t.assignedTo)?.name ?? "someone"}`}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      await fetchJson(`/api/groups/${group.id}?taskId=${t.id}`, { method: "DELETE" });
                      onChanged();
                    }}
                    className="shrink-0 text-slate-600 hover:text-red-300"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="input flex-1 py-2 text-[13px]"
              placeholder="Add shared work…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              type="date"
              className="input w-auto py-2 text-[13px]"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
            <button
              className="btn-primary shrink-0 px-4 py-2 text-xs"
              disabled={title.trim().length < 1}
              onClick={async () => {
                await post({ action: "task", title, dueAt: dueAt || null });
                setTitle(""); setDueAt("");
              }}
            >
              Post
            </button>
          </div>
        </div>

        {/* Discussion */}
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h4 className="text-[13px] font-medium text-white">Discussion</h4>

          {comments.length > 0 && (
            <div className="mt-2.5 space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-white/[0.02] px-3.5 py-2.5">
                  <div className="text-[11px] text-slate-500">
                    {c.name ?? "Someone"} ·{" "}
                    {new Date(c.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-300">{c.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              className="input flex-1 py-2 text-[13px]"
              placeholder="Say something…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && comment.trim()) {
                  await post({ action: "comment", body: comment });
                  setComment("");
                }
              }}
            />
            <button
              className="btn-ghost shrink-0 px-4 py-2 text-xs"
              disabled={comment.trim().length < 1}
              onClick={async () => { await post({ action: "comment", body: comment }); setComment(""); }}
            >
              Send
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <button
          className="btn-ghost mt-6 px-3 py-2 text-xs text-red-300/80 hover:text-red-300"
          onClick={async () => {
            await fetchJson(`/api/groups/${group.id}`, { method: "DELETE" });
            onBack();
          }}
        >
          {group.role === "owner" ? "Delete group" : "Leave group"}
        </button>
      </section>
    </div>
  );
}
