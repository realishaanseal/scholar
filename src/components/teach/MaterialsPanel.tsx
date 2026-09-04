"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { EASE_OUT, Reveal } from "@/components/motion";
import { cn } from "@/lib/cn";
import type { CourseMaterial } from "@/domains/library";

/**
 * The course library.
 *
 * Materials belong to the course, not to a week's homework — the textbook is
 * still the textbook in March. So this is a flat, durable list rather than
 * something nested inside assignments, which is the arrangement that leaves
 * students hunting for a PDF through six weeks of coursework.
 *
 * Upload is drag-and-drop with a visible fallback, because handing out a set
 * text is the single most common thing a teacher will do here and it should
 * not require finding a menu.
 */

type Material = CourseMaterial & { downloadUrl: string | null };

export default function MaterialsPanel({
  courseId,
  initial,
}: {
  courseId: string;
  initial: Material[];
}) {
  const [materials, setMaterials] = useState<Material[]>(initial);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const list = Array.from(files);
      setUploading((u) => [...u, ...list.map((f) => f.name)]);

      for (const file of list) {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("kind", guessKind(file));

          const res = await fetch(`/api/institution/courses/${courseId}/materials`, {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Upload failed.");
          setMaterials((prev) => [...prev, data.material]);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setUploading((u) => u.filter((n) => n !== file.name));
        }
      }
    },
    [courseId]
  );

  async function togglePublished(m: Material) {
    const next = !m.isPublished;
    // Optimistic: the toggle is the whole interaction, and waiting a round
    // trip to see a switch move makes it feel broken.
    setMaterials((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, isPublished: next } : x))
    );
    const res = await fetch(`/api/institution/materials/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPublished: next }),
    });
    if (!res.ok) {
      setMaterials((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, isPublished: !next } : x))
      );
      setError("Could not change who can see that.");
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Remove "${m.title}"? Students will no longer see it.`)) return;
    const previous = materials;
    setMaterials((prev) => prev.filter((x) => x.id !== m.id));
    const res = await fetch(`/api/institution/materials/${m.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMaterials(previous);
      setError("Could not remove that.");
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed px-5 py-7 text-center transition-colors",
          dragging
            ? "border-[hsl(var(--accent-h)_var(--accent-s)_var(--accent-l))] bg-[hsl(var(--accent-h)_var(--accent-s)_var(--accent-l))]/[0.06]"
            : "border-white/[0.12] hover:border-white/[0.2]"
        )}
      >
        <p className="text-[13.5px] text-slate-300">
          Drop textbooks, worksheets or slides here
        </p>
        <p className="mt-1 text-[12px] text-slate-500">
          PDF, EPUB, Word, PowerPoint, images — up to 32MB.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-ghost mt-3 px-3.5 py-1.5 text-[12.5px]"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-[13px] text-amber-200"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {uploading.map((name) => (
            <motion.div
              key={`up-${name}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="card flex items-center gap-3 rounded-xl px-4 py-3"
            >
              <div className="skeleton-shimmer h-8 w-8 rounded-lg" />
              <p className="min-w-0 flex-1 truncate text-[13.5px] text-slate-400">{name}</p>
              <span className="text-[12px] text-slate-500">Uploading…</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {materials.length === 0 && uploading.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-500">
            Nothing in this course library yet.
          </p>
        ) : (
          materials.map((m, i) => (
            <Reveal key={m.id} y={6} delay={Math.min(i * 0.03, 0.15)}>
              <div className="card flex items-center gap-3.5 rounded-xl px-4 py-3">
                <FileGlyph kind={m.kind} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-slate-100">
                    {m.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                    {m.sizeBytes !== null ? formatSize(m.sizeBytes) : "Link"}
                    {m.filename && m.filename !== m.title && ` · ${m.filename}`}
                  </p>
                </div>

                {/* Says who can see it, not what the switch is called. */}
                <button
                  type="button"
                  onClick={() => void togglePublished(m)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                    m.isPublished
                      ? "bg-emerald-400/[0.12] text-emerald-300 hover:bg-emerald-400/20"
                      : "bg-white/[0.05] text-slate-400 hover:bg-white/[0.09]"
                  )}
                >
                  {m.isPublished ? "Students can see" : "Only you"}
                </button>

                {(m.downloadUrl ?? m.url) && (
                  <a
                    href={(m.downloadUrl ?? m.url)!}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
                  >
                    Open
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => void remove(m)}
                  aria-label={`Remove ${m.title}`}
                  className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-slate-500 transition-colors hover:bg-rose-400/[0.09] hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            </Reveal>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * The kind is guessed from the file rather than asked for.
 *
 * A teacher uploading a PDF should not have to tell the app it is a document.
 * EPUB is the one worth detecting specifically, because "ebook" is the label a
 * student scanning a reading list is looking for.
 */
function guessKind(file: File): string {
  const type = file.type;
  const name = file.name.toLowerCase();
  if (type === "application/epub+zip" || name.endsWith(".epub")) return "ebook";
  if (type.includes("presentation") || name.endsWith(".ppt") || name.endsWith(".pptx")) {
    return "slides";
  }
  if (type.startsWith("video/")) return "video";
  if (name.includes("worksheet") || name.includes("exercise")) return "worksheet";
  return "document";
}

function FileGlyph({ kind }: { kind: string }) {
  const letter =
    kind === "ebook" ? "E" : kind === "slides" ? "P" : kind === "video" ? "V" : "D";
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-400">
      {letter}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
