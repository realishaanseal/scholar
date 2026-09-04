"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import type { ExtensionRequest } from "@/domains/assessment";

/**
 * Ask for more time, carrying the arithmetic.
 *
 * Shown only where Scholar has worked out that the work does not fit in the
 * time left. Until now that finding stopped at the student, which puts the
 * whole burden of acting on it on the person least placed to carry it: asking
 * for an extension means opening an awkward conversation and making a case,
 * and the students who most need one are reliably the least likely to start.
 *
 * The case is already made. The two figures go with the request, so the
 * teacher is answering evidence rather than a plea, and the student does not
 * have to find the words for something a spreadsheet already knows.
 *
 * The message box is optional and stays optional. Requiring a paragraph would
 * put the barrier straight back.
 */
export default function AskForTime({
  assignmentId,
  workMins,
  availableMins,
  existing,
}: {
  assignmentId: string;
  workMins: number;
  availableMins: number;
  /** A request already sent for this piece, if there is one. */
  existing?: ExtensionRequest | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<ExtensionRequest | null>(existing ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hours = (m: number) => Math.round((m / 60) * 10) / 10;

  if (sent) {
    return (
      <p className="mt-1.5 text-[11.5px] text-slate-500">
        {sent.status === "pending" && "You have asked for more time on this. Waiting for your teacher."}
        {sent.status === "granted" && "Your teacher agreed to more time on this."}
        {sent.status === "declined" && "Your teacher answered: no extension on this one."}
        {sent.status === "withdrawn" && "You withdrew this request."}
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await fetchJson<{ request: ExtensionRequest }>(
      `/api/institution/assignments/${assignmentId}/extension`,
      {
        method: "POST",
        body: JSON.stringify({
          workMins: Math.round(workMins),
          availableMins: Math.round(availableMins),
          message,
        }),
      }
    );
    setBusy(false);
    if (err || !data) {
      setError(err ?? "That did not send. Try again.");
      return;
    }
    setSent(data.request);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 rounded-lg border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-slate-300 hover:border-white/[0.24]"
      >
        Ask for more time
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11.5px] leading-relaxed text-slate-400">
        Your teacher will see that you have{" "}
        <span className="text-slate-200">{hours(workMins)} hours</span> of work and{" "}
        <span className="text-slate-200">{hours(availableMins)} hours</span> to do it in.
        Nothing else about how you work is shared.
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Anything you want to add (optional)"
        className="mt-2 w-full rounded-lg border border-white/[0.1] bg-black/20 px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-vx-500/50 focus:outline-none"
      />

      {error && <p className="mt-1.5 text-[11.5px] text-rose-300">{error}</p>}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={send}
          className="rounded-lg border border-vx-500/40 bg-vx-500/10 px-3 py-1 text-[11.5px] text-vx-200 hover:border-vx-500/60 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1 text-[11.5px] text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
