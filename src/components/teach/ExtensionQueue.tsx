"use client";

import { useState } from "react";
import type { ExtensionRequest } from "@/domains/assessment";
import { fetchJson } from "@/lib/fetchJson";

/**
 * Requests for more time, waiting on this teacher.
 *
 * Each carries what Scholar computed when the student sent it, so the decision
 * is made against the same arithmetic the student saw rather than against a
 * paragraph they had to compose under pressure.
 *
 * Granting records the decision and does not move the deadline. Scholar does
 * not know what was agreed, and a date it invented would be worse than none.
 * The prompt says so, because a teacher who assumes otherwise has a student
 * who thinks they have until Monday.
 */
export default function ExtensionQueue({ initial }: { initial: ExtensionRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const hours = (m: number) => Math.round((m / 60) * 10) / 10;

  async function decide(r: ExtensionRequest, status: "granted" | "declined") {
    setBusy(r.id);
    setError(null);
    const { error: err } = await fetchJson(
      `/api/institution/assignments/${r.assignmentId}/extension`,
      { method: "PATCH", body: JSON.stringify({ id: r.id, status, note: "" }) }
    );
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    setRequests((rs) => rs.filter((x) => x.id !== r.id));
  }

  return (
    <section className="card mb-5 rounded-xl px-4 py-4">
      <h2 className="text-[13.5px] font-medium text-slate-200">
        Asked for more time
      </h2>
      <p className="mt-1 text-[12px] text-slate-500">
        {requests.length} waiting. Granting records your answer; it does not move the deadline.
      </p>

      {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}

      <ul className="mt-3 space-y-2.5">
        {requests.map((r) => {
          const short = r.workMins - r.availableMins;
          return (
            <li
              key={r.id}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-[13px] text-slate-100">
                  {r.studentName ?? "A student"}
                </span>
                <span className="text-[12.5px] text-slate-400">{r.assignmentTitle}</span>
              </div>

              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                {hours(r.workMins)} hours of work outstanding, {hours(r.availableMins)} hours
                of study time before it is due
                {short > 0 && (
                  <span className="text-amber-300"> — about {hours(short)} hours short</span>
                )}
                .
              </p>

              {r.message && (
                <p className="mt-1.5 border-s-2 border-white/[0.08] ps-2.5 text-[12px] leading-relaxed text-slate-300">
                  {r.message}
                </p>
              )}

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r, "granted")}
                  className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.07] px-3 py-1.5 text-[12px] text-emerald-200 hover:border-emerald-400/50 disabled:opacity-50"
                >
                  Grant
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r, "declined")}
                  className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] text-slate-300 hover:border-white/[0.2] disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
