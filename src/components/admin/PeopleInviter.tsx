"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Bringing people into the institution.
 *
 * The previous answer was a command-line script that could only link people
 * who had already registered — which meant a class could not be enrolled
 * until every student had signed up, and nobody could tell them what to sign
 * up for because the course did not exist until they had. An invitation
 * breaks that circle.
 *
 * Addresses are pasted in bulk on purpose. The realistic input is a column
 * out of a spreadsheet, and an administrator asked to add thirty students one
 * at a time is an administrator deciding this software is not worth the
 * trouble.
 *
 * The result distinguishes the two outcomes rather than reporting a single
 * count. "Added" and "will join when they register" look identical on a
 * roster that is shorter than expected, and only one of them is a problem.
 */

type Section = { id: string; label: string };

const ROLES = [
  { id: "STUDENT", label: "Student" },
  { id: "TEACHER", label: "Teacher" },
  { id: "TEACHING_ASSISTANT", label: "Teaching assistant" },
  { id: "INSTITUTION_ADMIN", label: "Administrator" },
] as const;

export default function PeopleInviter({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<string>("STUDENT");
  const [sectionId, setSectionId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: string[]; invited: string[] } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/institution/admin/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emails,
          role,
          courseSectionId: sectionId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add those people.");

      setResult({ added: data.added ?? [], invited: data.invited ?? [] });
      setEmails("");
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
        Add people
      </button>
    );
  }

  return (
    <form onSubmit={send} className="card mb-5 rounded-xl px-4 py-4">
      <h2 className="mb-3 text-[13.5px] font-medium text-slate-200">Add people</h2>

      <label className="block">
        <span className="mb-1 block text-[11.5px] text-slate-400">
          Email addresses{" "}
          <span className="font-normal text-slate-600">
            — one per line, or pasted from a spreadsheet
          </span>
        </span>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={5}
          required
          placeholder={"aisha@school.edu\nben@school.edu\ncarla@school.edu"}
          className="input w-full resize-y font-mono text-[12.5px]"
        />
      </label>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-slate-400">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input w-full"
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>

        {sections.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-slate-400">
              Put them in a class{" "}
              <span className="font-normal text-slate-600">— optional</span>
            </span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="input w-full"
            >
              <option value="">No class</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-[13px]">
          {saving ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setResult(null); }}
          className="btn btn-ghost px-3 py-2 text-[13px]"
        >
          Done
        </button>
        {error && <span className="text-[12.5px] text-rose-300">{error}</span>}
      </div>

      {result && (
        <div className="mt-3 space-y-1.5">
          {result.added.length > 0 && (
            <p className="text-[12.5px] text-emerald-300">
              {result.added.length} added — they already had a Scholar account.
            </p>
          )}
          {result.invited.length > 0 && (
            <p className="text-[12.5px] text-slate-300">
              {result.invited.length} invited. They join automatically when they sign up
              with that address — tell them to register at your Scholar address; there is
              nothing they need from you beyond that.
            </p>
          )}
          {result.added.length === 0 && result.invited.length === 0 && (
            <p className="text-[12.5px] text-amber-300">
              No valid addresses found in that.
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11.5px] text-slate-600">
        Scholar sends no email — tell them to register yourself.
      </p>
    </form>
  );
}
