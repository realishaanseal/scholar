"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fetchJson } from "@/lib/fetchJson";

export type PendingAttachment = {
  localId: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  id?: string; // server attachment id once uploaded
  error?: string;
};

/** "+" button below the mic — opens a native file picker, any file type accepted. */
export function AttachButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (pending: PendingAttachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const pending: PendingAttachment[] = files.map((f) => ({
      localId: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      status: "uploading",
    }));
    onFiles(pending);

    files.forEach((file, i) => uploadFile(file, pending[i].localId));

    e.target.value = "";
  }

  async function uploadFile(file: File, localId: string) {
    const form = new FormData();
    form.append("file", file);
    const { ok, data, error } = await fetchJson<{ id: string }>("/api/attachments", {
      method: "POST",
      body: form,
    });
    window.dispatchEvent(
      new CustomEvent("scholar:attachment-result", {
        detail: { localId, ok, id: data?.id, error: error ?? "Upload failed" },
      })
    );
  }

  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={handleChange} accept="*/*" />
      <button
        type="button"
        onClick={pick}
        disabled={disabled}
        title="Attach a file"
        className="group grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl border border-white/10
                   bg-white/[0.045] transition-all duration-300 ease-spring
                   hover:scale-105 hover:border-white/20 hover:bg-white/[0.08] active:scale-95
                   disabled:opacity-40 disabled:hover:scale-100"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[20px] w-[20px] text-slate-300 transition-colors group-hover:text-white"
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </>
  );
}

/** Listens for upload results and shows attached-file chips with progress / remove. */
export function AttachmentChips({
  attachments,
  onUpdate,
  onRemove,
  onAnalyse,
  analysing,
}: {
  attachments: PendingAttachment[];
  onUpdate: (updater: (prev: PendingAttachment[]) => PendingAttachment[]) => void;
  onRemove: (localId: string) => void;
  /** Read the file's contents with the AI, as an assignment or a syllabus. */
  onAnalyse?: (attachmentId: string, mode: "assignment" | "syllabus") => void;
  analysing?: boolean;
}) {
  useEffect(() => {
    function handler(e: Event) {
      const { localId, ok, id, error } = (e as CustomEvent).detail;
      onUpdate((prev) =>
        prev.map((a) =>
          a.localId === localId ? { ...a, status: ok ? "done" : "error", id, error: ok ? undefined : error } : a
        )
      );
    }
    window.addEventListener("scholar:attachment-result", handler);
    return () => window.removeEventListener("scholar:attachment-result", handler);
  }, [onUpdate]);

  if (!attachments.length) return null;

  const ready = attachments.filter((a) => a.status === "done" && a.id);

  return (
    <>
    <div className="mt-3 flex flex-wrap gap-2">
      <AnimatePresence initial={false}>
      {attachments.map((a) => (
        <motion.span
          key={a.localId}
          layout
          initial={{ opacity: 0, scale: 0.8, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -6 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          <span className="max-w-[140px] truncate">{a.name}</span>
          {a.status === "uploading" && <span className="text-amber-300/80">uploading…</span>}
          {a.status === "error" && <span className="text-red-300/80">failed</span>}
          <button
            type="button"
            onClick={() => onRemove(a.localId)}
            className="ml-0.5 text-slate-500 hover:text-white"
            title="Remove"
          >
            ✕
          </button>
        </motion.span>
      ))}
      </AnimatePresence>
    </div>

    {/* Reading the file is an explicit action: it costs an API call, and the
        student may only want the file kept as a reference. */}
    {onAnalyse && ready.length > 0 && (
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip-btn border border-white/[0.09] bg-white/[0.03] text-[11px] text-slate-300
                     hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
          onClick={() => onAnalyse(ready[0].id!, "assignment")}
          disabled={analysing}
        >
          {analysing ? "Reading…" : "Read as assignment"}
        </button>
        <button
          type="button"
          className="chip-btn border border-white/[0.09] bg-white/[0.03] text-[11px] text-slate-300
                     hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
          onClick={() => onAnalyse(ready[0].id!, "syllabus")}
          disabled={analysing}
        >
          Import as syllabus
        </button>
        <span className="text-[10.5px] text-slate-600">
          Scholar reads {ready[0].name} and fills in the details
        </span>
      </div>
    )}
    </>
  );
}
