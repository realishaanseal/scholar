"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";

type Group = {
  id: string; kind: string; name: string; subjectName: string | null;
  ownerUserId: string; joinCode: string | null; role: string; memberCount: number;
};

type GroupTask = {
  id: string; title: string; details: string; subjectName: string | null;
  dueAt: string | null; estimateMins: number | null; assignedTo: string | null;
  createdBy: string; createdAt: string; reportCount: number; reportedByMe: boolean;
};

type Member = { userId: string; role: string; name: string | null; email: string | null };
type Attachment = { id: string; filename: string; mimeType: string; size: number };
type Comment = { id: string; userId: string; body: string; createdAt: string; name: string | null; attachments: Attachment[] };

const REASONS: Array<{ id: "wrong" | "misleading" | "off-topic" | "other"; label: string }> = [
  { id: "wrong", label: "Wrong" },
  { id: "misleading", label: "Misleading" },
  { id: "off-topic", label: "Off-topic" },
  { id: "other", label: "Other" },
];

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

      <AnimatePresence>
      {openId && (
        <GroupDetailOverlay
          key="group-overlay"
          detail={detail}
          onClose={() => { setOpenId(null); setDetail(null); load(); }}
          onChanged={() => openGroup(openId)}
        />
      )}
      </AnimatePresence>
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

/**
 * The dedicated group view. A full-screen overlay rather than an inline
 * panel — a group's shared work, discussion and members deserve room to
 * breathe rather than being squeezed into the Settings column's width.
 */
function GroupDetailOverlay({
  detail, onClose, onChanged,
}: {
  detail: { group: Group; tasks: GroupTask[]; members: Member[]; comments: Comment[] } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.32, ease: EASE_OUT }}
        className="card flex h-full w-full max-w-[880px] flex-col overflow-hidden sm:h-[min(88vh,880px)] sm:rounded-2xl"
      >
        {!detail ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="skeleton-shimmer h-8 w-40 rounded-lg" />
          </div>
        ) : (
          <GroupDetail detail={detail} onClose={onClose} onChanged={onChanged} />
        )}
      </motion.div>
    </motion.div>
  );
}

function GroupDetail({
  detail, onClose, onChanged,
}: {
  detail: { group: Group; tasks: GroupTask[]; members: Member[]; comments: Comment[] };
  onClose: () => void;
  onChanged: () => void;
}) {
  const { group, tasks, members, comments } = detail;
  const [tab, setTab] = useState<"work" | "discussion" | "members">("work");
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
    return ok;
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-5 sm:p-6">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-white">{group.name}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {group.kind === "course" ? "Course" : "Study group"} · {members.length} member
            {members.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {group.joinCode && (
            <div className="hidden text-right sm:block">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Join code</div>
              <div className="font-mono text-[14px] tracking-[0.2em] text-white">{group.joinCode}</div>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-slate-400 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-white/[0.07] px-4 pt-2 sm:px-6">
        {([
          ["work", "Shared work"],
          ["discussion", "Discussion"],
          ["members", "Members"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`tap-tall rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
              tab === id ? "border-b-2 border-vx-400 text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
            {id === "work" && tasks.some((t) => t.reportCount > 0) && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                {tasks.filter((t) => t.reportCount > 0).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {error && (
          <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {tab === "work" && (
          <SharedWork group={group} tasks={tasks} members={members} isOwner={isOwner} post={post} onChanged={onChanged} />
        )}
        {tab === "discussion" && (
          <Discussion groupId={group.id} comments={comments} post={post} />
        )}
        {tab === "members" && (
          <MembersTab group={group} members={members} isOwner={isOwner} post={post} onChanged={onChanged} />
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 sm:px-6">
        {group.joinCode && (
          <span className="text-[11px] text-slate-500 sm:hidden">
            Join code: <span className="font-mono text-slate-300">{group.joinCode}</span>
          </span>
        )}
        <button
          className="btn-ghost ml-auto px-3 py-2 text-xs text-red-300/80 hover:text-red-300"
          onClick={async () => {
            await fetchJson(`/api/groups/${group.id}`, { method: "DELETE" });
            onClose();
          }}
        >
          {group.role === "owner" ? "Delete group" : "Leave group"}
        </button>
      </div>
    </>
  );
}

function SharedWork({
  group, tasks, members, isOwner, post, onChanged,
}: {
  group: Group; tasks: GroupTask[]; members: Member[]; isOwner: boolean;
  post: (body: Record<string, unknown>) => Promise<boolean>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", subjectName: "", details: "", dueAt: "", estimateMins: "", assignedTo: "",
  });

  async function submit() {
    const ok = await post({
      action: "task",
      title: form.title,
      subjectName: form.subjectName.trim() || null,
      details: form.details,
      dueAt: form.dueAt || null,
      estimateMins: form.estimateMins ? Number(form.estimateMins) : null,
      assignedTo: form.assignedTo || null,
    });
    if (ok) {
      setForm({ title: "", subjectName: "", details: "", dueAt: "", estimateMins: "", assignedTo: "" });
      setOpen(false);
    }
  }

  return (
    <div>
      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-8 text-center text-xs text-slate-500">
          Nothing posted yet.
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              groupId={group.id}
              members={members}
              isOwner={isOwner}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      {!open ? (
        <button className="btn-ghost mt-4 px-3 py-2 text-xs" onClick={() => setOpen(true)}>
          Post shared work
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input
              className="input py-2 text-[13px] sm:col-span-2"
              placeholder="What needs doing?"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
            <input
              className="input py-2 text-[13px]"
              placeholder="Subject (optional)"
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
            />
            <input
              type="date"
              className="input py-2 text-[13px]"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
            <input
              type="number"
              min={1}
              className="input py-2 text-[13px]"
              placeholder="Minutes (optional)"
              value={form.estimateMins}
              onChange={(e) => setForm({ ...form, estimateMins: e.target.value })}
            />
            <select
              className="input py-2 text-[13px]"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              <option value="">Assign to… (optional)</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name || m.email || "Member"}</option>
              ))}
            </select>
            <textarea
              className="input min-h-[64px] resize-y text-[13px] sm:col-span-2"
              placeholder="Details (optional)"
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button className="btn-primary px-4 py-2 text-xs" onClick={submit} disabled={form.title.trim().length < 1}>
              Post
            </button>
            <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, groupId, members, isOwner, onChanged,
}: {
  task: GroupTask; groupId: string; members: Member[]; isOwner: boolean; onChanged: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reports, setReports] = useState<Array<{ reason: string; note: string; name: string | null; email: string | null }> | null>(null);
  const assignee = members.find((m) => m.userId === task.assignedTo);

  async function toggleReport(reason: typeof REASONS[number]["id"]) {
    setReportOpen(false);
    if (task.reportedByMe) {
      await fetchJson(`/api/groups/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unreport-task", taskId: task.id }),
      });
    } else {
      await fetchJson(`/api/groups/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report-task", taskId: task.id, reason }),
      });
    }
    onChanged();
  }

  async function loadReports() {
    if (reports) { setReports(null); return; }
    const { data } = await fetchJson<{ reports: any[] }>(`/api/groups/${groupId}?reports=${task.id}`);
    setReports(data?.reports ?? []);
  }

  const flagTone =
    task.reportCount >= 3 ? "text-red-300" : task.reportCount > 0 ? "text-amber-300" : "text-slate-600";

  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 ${
        task.reportCount > 0 ? "border-amber-500/25 bg-amber-500/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-slate-200">
            {task.title}
            {task.subjectName && <span className="ml-1.5 text-[11px] text-slate-500">{task.subjectName}</span>}
          </span>
          <span className="block text-[11px] text-slate-600">
            {task.dueAt
              ? new Date(task.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
              : "No deadline"}
            {task.estimateMins && ` · ~${task.estimateMins}m`}
            {assignee && ` · assigned to ${assignee.name ?? assignee.email ?? "someone"}`}
          </span>
        </span>

        <div className="relative shrink-0">
          <button
            onClick={() => setReportOpen((v) => !v)}
            className={`tap-44 flex items-center gap-1 rounded-md px-1.5 text-[11px] ${flagTone} hover:text-amber-200`}
            aria-label="Report this post"
            title="Report as wrong, misleading, or something else"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={task.reportedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <path d="M4 22V4" />
            </svg>
            {task.reportCount > 0 && <span className="tabular-nums">{task.reportCount}</span>}
          </button>

          {reportOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-white/10 bg-ink-985 p-1.5 shadow-lift">
              {task.reportedByMe ? (
                <button
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] text-slate-300 hover:bg-white/[0.06]"
                  onClick={() => toggleReport("wrong")}
                >
                  Remove my report
                </button>
              ) : (
                REASONS.map((r) => (
                  <button
                    key={r.id}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] text-slate-300 hover:bg-white/[0.06]"
                    onClick={() => toggleReport(r.id)}
                  >
                    {r.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          onClick={async () => {
            await fetchJson(`/api/groups/${groupId}?taskId=${task.id}`, { method: "DELETE" });
            onChanged();
          }}
          className="tap-44 shrink-0 text-slate-600 hover:text-red-300"
          aria-label="Remove"
        >
          ✕
        </button>
      </div>

      {task.details && <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-400">{task.details}</p>}

      {isOwner && task.reportCount > 0 && (
        <div className="mt-2">
          <button onClick={loadReports} className="text-[11px] text-amber-300/80 underline underline-offset-2 hover:text-amber-200">
            {reports ? "Hide" : "View"} report{task.reportCount === 1 ? "" : "s"}
          </button>
          {reports && (
            <ul className="mt-1.5 space-y-1">
              {reports.map((r, i) => (
                <li key={i} className="text-[11px] text-slate-500">
                  <span className="text-amber-300/90">{r.reason}</span> — {r.name || r.email || "Someone"}
                  {r.note && <span className="text-slate-600"> · {r.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function Discussion({
  groupId, comments, post,
}: {
  groupId: string;
  comments: Comment[];
  post: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<{ base64: string; mimeType: string; name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(f: File) {
    setFileError(null);
    if (f.size > MAX_ATTACHMENT_BYTES) {
      setFileError("That file is over 5MB.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Couldn't read that file."));
      r.readAsDataURL(f);
    }).catch(() => null);
    if (!base64) { setFileError("Couldn't read that file."); return; }
    setFile({ base64, mimeType: f.type, name: f.name, size: f.size });
  }

  async function send() {
    if (sending || (!comment.trim() && !file)) return;
    setSending(true);
    const ok = await post({
      action: "comment",
      body: comment,
      attachment: file ? { filename: file.name, mimeType: file.mimeType, base64: file.base64, size: file.size } : null,
    });
    setSending(false);
    if (ok) { setComment(""); setFile(null); }
  }

  return (
    <div>
      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-8 text-center text-xs text-slate-500">
          No messages yet — say something.
        </p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-white/[0.02] px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500">
                {c.name ?? "Someone"} ·{" "}
                {new Date(c.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
              {c.body && <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-300">{c.body}</p>}
              {c.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.attachments.map((a) =>
                    a.mimeType.startsWith("image/") ? (
                      <a key={a.id} href={`/api/groups/${groupId}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/groups/${groupId}/attachments/${a.id}`} alt={a.filename} className="h-28 w-28 object-cover" />
                      </a>
                    ) : (
                      <a
                        key={a.id}
                        href={`/api/groups/${groupId}/attachments/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                        {a.filename}
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {file && (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button onClick={() => setFile(null)} className="tap-44 text-slate-600 hover:text-red-300" aria-label="Remove attachment">✕</button>
          </div>
        )}
        {fileError && <p className="text-[11px] text-red-300">{fileError}</p>}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost shrink-0 px-2.5 py-2 text-xs"
            aria-label="Attach a file"
            title="Attach a file"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          </button>
          <input
            className="input flex-1 py-2 text-[13px]"
            placeholder="Say something…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (comment.trim() || file)) send(); }}
          />
          <button
            className="btn-ghost shrink-0 px-4 py-2 text-xs"
            disabled={sending || (!comment.trim() && !file)}
            onClick={send}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersTab({
  group, members, isOwner, post, onChanged,
}: {
  group: Group; members: Member[]; isOwner: boolean;
  post: (body: Record<string, unknown>) => Promise<boolean>;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {group.joinCode && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Join code</div>
            <div className="font-mono text-[15px] tracking-[0.2em] text-white">{group.joinCode}</div>
          </div>
          {isOwner && (
            <button className="btn-ghost px-3 py-1.5 text-[11px]" onClick={() => post({ action: "rotate-code" })}>
              Change code
            </button>
          )}
        </div>
      )}

      {members.map((m) => (
        <div key={m.userId} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-slate-200">{m.name || m.email || "Member"}</span>
            <span className="block text-[11px] capitalize text-slate-500">{m.role}</span>
          </span>
          {isOwner && m.role !== "owner" && (
            <button
              onClick={async () => {
                await fetchJson(`/api/groups/${group.id}?memberId=${m.userId}`, { method: "DELETE" });
                onChanged();
              }}
              className="shrink-0 text-[11px] text-slate-500 hover:text-red-300"
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
