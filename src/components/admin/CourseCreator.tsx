"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Creating a course, from inside the product.
 *
 * This existed only as a command-line script, which meant an institution
 * could look at Scholar but could not start using it without somebody who had
 * shell access to the server. That is the difference between software that is
 * built and software that is deployable.
 *
 * A course and its first section are made together. A course with no section
 * cannot be taught, enrolled into, or given work — it is a row that looks
 * like progress and does nothing — and an administrator naming their first
 * class should not have to learn that "section" is a separate concept before
 * anything happens.
 */
export default function CourseCreator({ hasCourses }: { hasCourses: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasCourses);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/institution/admin/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          title,
          // Named for them if they did not care to. Most schools have one
          // section per course and being made to name it is a question with
          // no useful answer.
          sectionName: sectionName.trim() || "Section 1",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the course.");

      setCode("");
      setTitle("");
      setSectionName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary mb-4 px-4 py-2 text-[13px]"
      >
        New course
      </button>
    );
  }

  return (
    <form onSubmit={create} className="card mb-5 rounded-xl px-4 py-4">
      <h2 className="mb-3 text-[13.5px] font-medium text-slate-200">New course</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-slate-400">Code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PHY101"
            required
            maxLength={32}
            className="input w-full"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11.5px] text-slate-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Physics I"
            required
            maxLength={200}
            className="input w-full"
          />
        </label>
      </div>

      <label className="mt-3 block max-w-[280px]">
        <span className="mb-1 block text-[11.5px] text-slate-400">
          First class{" "}
          <span className="font-normal text-slate-600">— optional</span>
        </span>
        <input
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="Section 1"
          maxLength={80}
          className="input w-full"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-[13px]">
          {saving ? "Creating…" : "Create course"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="btn btn-ghost px-3 py-2 text-[13px]"
        >
          Cancel
        </button>
        {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
        The academic year and term are set up for you if this is your first course. You
        can rename them later; nothing here is difficult to change.
      </p>
    </form>
  );
}
