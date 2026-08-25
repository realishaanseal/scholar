"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetchJson";

type ParsedClass = {
  title: string;
  subjectName: string | null;
  dayOfWeek: number;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  location: string | null;
  teacherName: string | null;
};

type ParseResult = {
  classes: ParsedClass[];
  warnings: string[];
  notes: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

const PLACEHOLDER = `Paste your timetable however it comes — a grid copied from a PDF, a list, whatever your school gives you. For example:

Mon  P1 08:40 Maths R12   P2 09:40 Physics Lab2
Tue  P1 08:40 English R4  P2 09:40 Chemistry R9
...`;

/** Photos of a printed timetable are common; keep well under the route's cap. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * Bulk timetable entry. Sits above the per-class form rather than replacing
 * it: this path needs an AI provider and a readable source, and neither is
 * guaranteed, so the manual route always stays available underneath.
 *
 * Nothing is written until the student confirms — the parse endpoint only
 * reads, and rows can be unticked individually before saving.
 */
export default function TimetableImport({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResult(null);
    setChosen(new Set());
    setError(null);
    setDone(null);
  }

  async function pickImage(file: File) {
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 6MB — try a smaller photo or screenshot.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      // readAsDataURL gives "data:<mime>;base64,<payload>" — the API wants
      // only the payload, so drop everything up to the comma.
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("That file couldn't be read."));
      r.readAsDataURL(file);
    }).catch(() => null);

    if (!base64) {
      setError("That file couldn't be read.");
      return;
    }
    setImage({ base64, mimeType: file.type, name: file.name });
  }

  async function parse() {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    reset();

    const { ok, data, error } = await fetchJson<ParseResult & { needsProvider?: boolean }>(
      "/api/timetable/parse",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ? { base64: image.base64, mimeType: image.mimeType } : null,
        }),
      }
    );

    setBusy(false);

    if (!ok || !data) {
      setError(error ?? "That timetable couldn't be read.");
      if ((data as any)?.needsProvider || /needs an AI provider/i.test(error ?? "")) {
        setNeedsProvider(true);
      }
      return;
    }

    setResult(data);
    // Everything the model was confident enough to return starts ticked; the
    // warnings list is what it wasn't sure about, and that's shown separately.
    setChosen(new Set(data.classes.map((_, i) => i)));
  }

  function toggle(i: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function commit() {
    if (!result || saving || chosen.size === 0) return;
    setSaving(true);
    setError(null);

    const classes = result.classes
      .filter((_, i) => chosen.has(i))
      .map((c) => ({
        title: c.title,
        subjectName: c.subjectName,
        dayOfWeek: c.dayOfWeek,
        startHour: c.startHour,
        startMin: c.startMin,
        endHour: c.endHour,
        endMin: c.endMin,
        location: c.location,
        teacherName: c.teacherName,
      }));

    const { ok, data, error } = await fetchJson<{ created: number }>("/api/timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes }),
    });

    setSaving(false);

    if (!ok || !data) {
      setError(error ?? "Those classes couldn't be saved.");
      return;
    }

    setDone(data.created);
    setResult(null);
    setChosen(new Set());
    setText("");
    setImage(null);
    onImported();
  }

  return (
    <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-medium text-slate-200">Import a whole timetable</h4>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Paste it or attach a photo — Scholar reads it and you confirm before anything saves.
          </p>
        </div>
        {done !== null && (
          <span className="shrink-0 text-[11px] text-emerald-300">
            Added {done} {done === 1 ? "class" : "classes"}
          </span>
        )}
      </div>

      {!result && (
        <>
          <textarea
            className="input mt-3 min-h-[104px] resize-y text-[13px]"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickImage(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-ghost px-3 py-2 text-xs"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {image ? "Change photo" : "Attach a photo"}
            </button>

            {image && (
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                <span className="max-w-[140px] truncate">{image.name}</span>
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="tap-44 text-slate-600 hover:text-red-300"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={parse}
              disabled={busy || (!text.trim() && !image)}
              className="btn-primary ml-auto px-4 py-2 text-xs"
            >
              {busy ? "Reading…" : "Read timetable"}
              {!busy && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-300">
          {error}
          {needsProvider && (
            <Link href="/settings" className="ml-1 underline underline-offset-2 hover:text-red-200">
              Open AI settings
            </Link>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 animate-riseIn">
          {result.notes && <p className="text-[11px] italic text-slate-500">{result.notes}</p>}

          {result.classes.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              No classes could be read from that. Try pasting it as plain text, or add them
              individually below.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {chosen.size} of {result.classes.length} selected
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setChosen(
                      chosen.size === result.classes.length
                        ? new Set()
                        : new Set(result.classes.map((_, i) => i))
                    )
                  }
                  className="chip-btn border border-white/[0.08] bg-white/[0.025] text-[11px] text-slate-400 hover:text-slate-200"
                >
                  {chosen.size === result.classes.length ? "Clear all" : "Select all"}
                </button>
              </div>

              <div className="mt-2 max-h-[320px] space-y-1 overflow-y-auto pr-1">
                {result.classes.map((c, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.has(i)}
                      onChange={() => toggle(i)}
                      className="h-4 w-4 shrink-0 accent-vx-500"
                    />
                    <span className="w-9 shrink-0 text-[11px] text-slate-500">{DAYS[c.dayOfWeek]}</span>
                    <span className="w-[86px] shrink-0 text-[11px] tabular-nums text-slate-500">
                      {pad(c.startHour)}:{pad(c.startMin)}–{pad(c.endHour)}:{pad(c.endMin)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200">
                      {c.title}
                      {c.teacherName && <span className="ml-1.5 text-[11px] text-slate-500">{c.teacherName}</span>}
                      {c.location && <span className="ml-1.5 text-[11px] text-slate-600">{c.location}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {result.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <p className="text-[11px] font-medium text-amber-300">
                Couldn&apos;t place {result.warnings.length}{" "}
                {result.warnings.length === 1 ? "row" : "rows"}
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-amber-300/75">
                    {w}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Add those with the form below.
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={saving || chosen.size === 0}
              className="btn-primary px-4 py-2 text-xs"
            >
              {saving
                ? "Saving…"
                : `Add ${chosen.size} ${chosen.size === 1 ? "class" : "classes"}`}
            </button>
            <button type="button" onClick={reset} className="btn-ghost px-3 py-2 text-xs">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
