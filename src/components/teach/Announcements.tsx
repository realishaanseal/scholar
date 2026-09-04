"use client";

import { useEffect, useState } from "react";

/**
 * Saying something to a class.
 *
 * One component for both sides. A student sees a list; a teacher sees the
 * same list with a box above it, because the difference between the two is
 * one permission and building two components would mean two places to fix
 * every future change to how a notice reads.
 *
 * The composer is a title and a body and nothing else. Every additional field
 * on this form is a reason not to bother posting, and a teacher who does not
 * bother is a class that does not know about the room change.
 */

type Announcement = {
  id: string;
  title: string;
  body: string;
  authorLabel: string;
  publishedAt: string | null;
  sectionId: string | null;
};

export default function Announcements({ sectionId }: { sectionId: string }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/institution/sections/${sectionId}/announcements`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.announcements ?? []);
      setCanPost(Boolean(data.canPost));
    } catch {
      // A list that will not load is not worth an error banner on a page
      // whose main job is something else.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/institution/sections/${sectionId}/announcements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, publish: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post that.");
      setTitle("");
      setBody("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canPost && (
        <form onSubmit={post} className="card rounded-xl px-4 py-3.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Room change on Thursday"
            required
            maxLength={200}
            aria-label="Announcement title"
            className="input w-full"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Anything more you want to add"
            maxLength={20_000}
            aria-label="Announcement body"
            className="input mt-2 w-full resize-y"
          />
          <div className="mt-2.5 flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary px-3.5 py-1.5 text-[12.5px]">
              {saving ? "Posting…" : "Post to the class"}
            </button>
            {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
          </div>
          <p className="mt-2 text-[11.5px] text-slate-600">
            Scholar does not send email. This appears in the class straight away.
          </p>
        </form>
      )}

      {!loaded ? (
        <div className="skeleton-shimmer h-16 rounded-xl" />
      ) : items.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nothing posted yet</p>
          <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
            {canPost
              ? "Anything you post here appears for everyone in the class."
              : "Notices from your teacher and your school appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="card rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p className="text-[13.5px] font-medium text-slate-100">{a.title}</p>
                {/* An institution-wide notice is worth distinguishing: it did
                    not come from this teacher and cannot be asked about here. */}
                {a.sectionId === null && (
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">
                    Whole school
                  </span>
                )}
                {!a.publishedAt && (
                  <span className="rounded-full bg-amber-400/[0.12] px-2 py-0.5 text-[11px] text-amber-300">
                    Draft
                  </span>
                )}
              </div>
              {a.body && (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">
                  {a.body}
                </p>
              )}
              <p className="mt-1.5 text-[11.5px] text-slate-500">
                {a.authorLabel || "Somebody at your school"}
                {a.publishedAt &&
                  ` · ${new Date(a.publishedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
