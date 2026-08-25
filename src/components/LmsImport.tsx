"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetchJson";

type Candidate = {
  externalId: string;
  title: string;
  details: string;
  dueAt: string | null;
  subject: string;
  looksLikeAssignment: boolean;
  /** Already imported in an earlier sync — selecting it again updates the
   *  existing task (title/details/due date) rather than creating a duplicate. */
  alreadyImported: boolean;
};

const PLATFORMS = [
  { id: "canvas", label: "Canvas", instructions: "Open Calendar → “Calendar Feed” in the right sidebar → copy the link." },
  { id: "moodle", label: "Moodle", instructions: "Open Calendar → “Export calendar” → All events → “Get calendar URL”." },
  { id: "blackboard", label: "Blackboard", instructions: "Open Calendar → “Get External Calendar Link” → copy the URL." },
  { id: "classroom", label: "Google Classroom", instructions: "Classroom feeds into Google Calendar. In Calendar settings, open your Classroom calendar → “Secret address in iCal format”." },
  { id: "teams", label: "Teams / Outlook", instructions: "Outlook → Calendar → Share → Publish a calendar → “Can view all details” → copy the ICS link." },
];

const NOTICE_PLACEHOLDER = `Paste the homework notice or diary email as it was sent — school ERP apps
like Shikshak, Entab, Fedena, Teachmint and similar don't offer a calendar
feed, but they almost always email or post a homework notice you can copy.
For example:

Maths: Workbook pg 42, Q1-10. Submit tomorrow.
Science: Read Chapter 3, notes in copy.
English: Essay on "My favourite season" due Friday.`;

/**
 * Import assignments from a learning-management system.
 *
 * Uses the LMS's own iCalendar feed rather than its REST API: no OAuth, no
 * token to paste, works with every major platform, and the URL is per-student
 * and read-only. Imported items are reviewed before anything is saved.
 */
export default function LmsImport({ onImported }: { onImported?: () => void }) {
  const [mode, setMode] = useState<"feed" | "notice">("feed");
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [feedUrl, setFeedUrl] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [externalSource, setExternalSource] = useState("lms");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  async function preview() {
    setLoading(true);
    setError(null);
    setNeedsProvider(false);
    setDone(null);

    const { ok, data, error } = await fetchJson<{
      candidates: Candidate[]; total: number; externalSource: string; newCount: number; resyncCount: number;
    }>("/api/lms/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl }),
    });

    setLoading(false);

    if (!ok || !data) {
      setError(error ?? "Couldn't read that feed.");
      return;
    }

    setCandidates(data.candidates);
    setExternalSource(data.externalSource ?? "lms");
    // Pre-select what looks like actual coursework and isn't already
    // imported; class slots and already-synced items stay unticked so
    // committing doesn't flood the list with timetable entries or no-op
    // resyncs the student didn't ask for.
    setSelected(
      new Set(
        data.candidates.filter((c) => c.looksLikeAssignment && !c.alreadyImported).map((c) => c.externalId)
      )
    );
  }

  async function previewNotice() {
    setLoading(true);
    setError(null);
    setNeedsProvider(false);
    setDone(null);

    const { ok, data, error } = await fetchJson<{
      candidates: Candidate[]; total: number; externalSource: string; newCount: number; resyncCount: number;
      warnings?: string[]; needsProvider?: boolean;
    }>("/api/lms/notice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: noticeText }),
    });

    setLoading(false);

    if (!ok || !data) {
      setError(error ?? "That notice couldn't be read.");
      if ((data as any)?.needsProvider) setNeedsProvider(true);
      return;
    }

    setCandidates(data.candidates);
    setExternalSource(data.externalSource ?? "lms-notice");
    // Everything the model returned already passed its "is this coursework"
    // filter, so — unlike the ICS path — everything not already imported
    // starts ticked.
    setSelected(new Set(data.candidates.filter((c) => !c.alreadyImported).map((c) => c.externalId)));
  }

  async function commit() {
    if (!candidates) return;
    const items = candidates
      .filter((c) => selected.has(c.externalId))
      .map((c) => ({
        title: c.title.slice(0, 160),
        details: c.details,
        subject: c.subject,
        dueAt: c.dueAt,
        priority: "normal" as const,
        estimateMins: null,
        externalId: c.externalId,
      }));

    if (!items.length) return;

    setSaving(true);
    const { ok, data, error } = await fetchJson<{ created: number; updated: number }>("/api/homework/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, source: "import", externalSource }),
    });
    setSaving(false);

    if (ok) {
      setDone({ created: data?.created ?? items.length, updated: data?.updated ?? 0 });
      setCandidates(null);
      setFeedUrl("");
      setNoticeText("");
      onImported?.();
    } else setError(error ?? "Couldn't save those.");
  }

  function switchMode(next: "feed" | "notice") {
    setMode(next);
    setError(null);
    setNeedsProvider(false);
  }

  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Import from your school</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {mode === "feed"
          ? "Scholar reads your LMS's calendar feed — the same link you'd use to put coursework in Google Calendar. No account linking, and it only ever reads."
          : "For school ERPs that don't offer a calendar feed (Shikshak, Entab, Fedena, Teachmint and similar), paste the homework notice or diary email instead — Scholar reads it the same way."}
      </p>

      <div className="mt-4 flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1 text-[11.5px]">
        <button
          onClick={() => switchMode("feed")}
          className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${
            mode === "feed" ? "bg-white/[0.10] text-white" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Calendar feed
        </button>
        <button
          onClick={() => switchMode("notice")}
          className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${
            mode === "notice" ? "bg-white/[0.10] text-white" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Paste a notice / email
        </button>
      </div>

      {mode === "feed" ? (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p)}
                className={`rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  platform.id === p.id
                    ? "bg-white/[0.10] text-white"
                    : "border border-white/[0.07] text-slate-500 hover:text-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-400">
            {platform.instructions}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="input flex-1 py-2.5 text-[13px]"
              placeholder="https://…/feeds/calendars/user_xxx.ics"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              spellCheck={false}
            />
            <button
              className="btn-primary shrink-0 px-4 py-2.5 text-xs"
              onClick={preview}
              disabled={loading || feedUrl.trim().length < 8}
            >
              {loading ? "Reading…" : "Preview"}
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            className="input mt-4 min-h-[104px] resize-y text-[13px]"
            placeholder={NOTICE_PLACEHOLDER}
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            disabled={loading}
          />
          <div className="mt-2.5 flex justify-end">
            <button
              className="btn-primary px-4 py-2.5 text-xs"
              onClick={previewNotice}
              disabled={loading || noticeText.trim().length < 8}
            >
              {loading ? "Reading…" : "Read notice"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">
          {error}
          {needsProvider && (
            <Link href="/settings" className="ml-1 underline underline-offset-2 hover:text-red-200">
              Open AI settings
            </Link>
          )}
        </div>
      )}

      {done !== null && (
        <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-300">
          {done.created > 0 && `Added ${done.created} assignment${done.created === 1 ? "" : "s"}.`}
          {done.created > 0 && done.updated > 0 && " "}
          {done.updated > 0 && `Updated ${done.updated} already-imported item${done.updated === 1 ? "" : "s"}.`}
        </p>
      )}

      {candidates && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-medium text-white">
              {candidates.length} found
              <span className="ml-2 font-normal text-slate-500">{selected.size} selected</span>
            </h4>
            {candidates.some((c) => c.alreadyImported) && (
              <span className="text-[11px] text-slate-600">
                {candidates.filter((c) => c.alreadyImported).length} already imported — select to resync
              </span>
            )}
          </div>

          {candidates.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-slate-500">
              Nothing new in that feed.
            </p>
          ) : (
            <>
              <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                {candidates.map((c) => {
                  const on = selected.has(c.externalId);
                  return (
                    <button
                      key={c.externalId}
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          next.has(c.externalId) ? next.delete(c.externalId) : next.add(c.externalId);
                          return next;
                        })
                      }
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                        on ? "border-white/12 bg-white/[0.05]" : "border-white/[0.05] opacity-55"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          on ? "border-vx-400 bg-vx-500/30" : "border-white/20"
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-slate-200">{c.title}</span>
                        <span className="block text-[11px] text-slate-600">
                          {c.subject}
                          {c.dueAt && ` · ${new Date(c.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
                          {!c.looksLikeAssignment && " · looks like a class"}
                          {c.alreadyImported && " · already imported, resync"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button className="btn-primary px-5 py-2.5" onClick={commit} disabled={saving || selected.size === 0}>
                  {saving ? "Adding…" : `Add ${selected.size}`}
                </button>
                <button className="btn-ghost px-4 py-2.5 text-xs" onClick={() => setCandidates(null)}>
                  Cancel
                </button>
                <p className="ml-auto text-[11px] text-slate-600">Nothing saves until you add it.</p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
