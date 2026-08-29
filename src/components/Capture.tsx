"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SOFT } from "@/components/motion";
import { ListeningBars, MicButton, useDictation } from "./VoiceCapture";
import { AttachButton, AttachmentChips, type PendingAttachment } from "./AttachCapture";
import type { DraftHomework } from "@/lib/clientTypes";
import { fetchJson } from "@/lib/fetchJson";

const EXAMPLES = [
  "physics numericals ch 4, questions 1 to 12, due friday and it's graded",
  "english essay on Macbeth, 1200 words, next monday",
  "chem lab report by tomorrow 5pm",
];

export default function Capture({
  onDraft,
  onSyllabus,
  disabled,
}: {
  onDraft: (draft: DraftHomework) => void;
  /** A parsed syllabus plus its generated plan, for review before saving. */
  onSyllabus?: (payload: { syllabus: any; plan: any[]; filename: string }) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [analysingFile, setAnalysingFile] = useState(false);
  const sourceRef = useRef<"text" | "voice">("text");

  const speech = useDictation((chunk, isFinal) => {
    if (isFinal) {
      sourceRef.current = "voice";
      setText((t) => (t ? `${t.trim()} ${chunk.trim()}` : chunk.trim()));
      setInterim("");
    } else {
      setInterim(chunk);
    }
  });

  async function analyze() {
    const raw = text.trim();
    if (raw.length < 3) return;

    speech.stop();
    setAnalyzing(true);
    setError(null);

    try {
      const { ok, data, error } = await fetchJson<any>("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw,
          nowISO: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
      });

      if (!ok || !data) throw new Error(error ?? "The AI couldn't be reached.");

      const p = data;
      onDraft({
        title: p.title, details: p.details, subject: p.subject, dueAt: p.dueAt,
        priority: p.priority, estimateMins: p.estimateMins, rawInput: raw,
        source: sourceRef.current, aiConfidence: p.confidence, aiNotes: p.notes,
        provider: p.provider, degraded: p.degraded, providerError: p.providerError ?? null,
        attachmentIds: attachments.filter((a) => a.status === "done").map((a) => a.id!),
      });

      setText("");
      setInterim("");
      setAttachments([]);
      sourceRef.current = "text";
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setAnalyzing(false);
    }
  }

  /** Read an uploaded file with the AI and turn it into a draft or a study plan. */
  async function analyseFile(attachmentId: string, mode: "assignment" | "syllabus") {
    setAnalysingFile(true);
    setError(null);

    const { ok, data, error } = await fetchJson<any>("/api/documents/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId,
        mode,
        nowISO: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    setAnalysingFile(false);

    if (!ok || !data) {
      setError(error ?? "That file couldn't be read.");
      return;
    }

    if (data.mode === "syllabus") {
      onSyllabus?.({ syllabus: data.syllabus, plan: data.plan, filename: data.filename });
      setAttachments([]);
      return;
    }

    // An analysed assignment enters the same review step as a typed task, so
    // the student still approves it before anything is saved.
    const a = data.assignment;
    const extraDetails = [
      a.details,
      a.questionCount ? `${a.questionCount} questions.` : "",
      a.topics?.length ? `Topics: ${a.topics.join(", ")}.` : "",
      a.requirements?.length ? `Requirements: ${a.requirements.join("; ")}.` : "",
      a.submissionFormat ? `Submit: ${a.submissionFormat}.` : "",
    ].filter(Boolean).join("\n");

    onDraft({
      title: a.title,
      details: extraDetails,
      subject: a.subject,
      dueAt: a.dueAt,
      priority: a.priority,
      estimateMins: a.estimateMins,
      rawInput: `Read from ${data.filename}`,
      source: "text",
      aiConfidence: a.confidence,
      aiNotes: a.notes,
      provider: "file",
      degraded: false,
      providerError: null,
      attachmentIds: attachments.filter((x) => x.status === "done").map((x) => x.id!),
    });

    setText("");
    setAttachments([]);
  }

  const shown = text + (interim ? (text ? " " : "") + interim : "");

  return (
    <div
      className="card card-hover overflow-hidden p-5 xl:p-6"
      style={
        focused || speech.listening
          ? { borderColor: speech.listening ? "rgba(239,68,68,0.30)" : "rgba(91,124,250,0.30)" }
          : undefined
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Add homework</h2>

        {speech.listening ? (
          <span className="flex items-center gap-2 text-[11px] text-red-300">
            <ListeningBars />
            {speech.mode === "recording" ? "Recording…" : "Listening…"}
          </span>
        ) : speech.transcribing ? (
          <span className="text-[11px] text-amber-300">Transcribing…</span>
        ) : null}
      </div>

      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1">
          <textarea
            value={shown}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze();
            }}
            disabled={disabled || analyzing}
            placeholder={`e.g. ${EXAMPLES[0]}`}
            className="input min-h-[104px] resize-y text-[13.5px] leading-relaxed"
          />
          {interim && (
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-red-300/70">
              transcribing
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <MicButton
            listening={speech.listening}
            supported={speech.supported}
            transcribing={speech.transcribing}
            onClick={speech.toggle}
          />
          <AttachButton disabled={disabled || analyzing} onFiles={(files) => {
            setAttachments((prev) => [...prev, ...files]);
          }} />
        </div>
      </div>

      <AttachmentChips
        attachments={attachments}
        onUpdate={setAttachments}
        onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.localId !== id))}
        onAnalyse={analyseFile}
        analysing={analysingFile}
      />

      {speech.error && <p className="mt-2.5 text-xs text-amber-300/90">{speech.error}</p>}
      {speech.mode === "recording" && !speech.listening && !speech.transcribing && (
        <p className="mt-2.5 text-[11px] text-slate-600">
          Dictation records and transcribes with your AI provider, since this browser&apos;s
          built-in speech recognition isn&apos;t available.
        </p>
      )}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 10 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Example prompts — one tap to try it out */}
      <AnimatePresence>
        {!text && !speech.listening && (
          <motion.div
            className="mt-3.5 flex flex-wrap gap-2"
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          >
            {EXAMPLES.map((ex) => (
              <motion.button
                key={ex}
                variants={{
                  hidden: { opacity: 0, y: 8, scale: 0.95 },
                  show: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
                }}
                whileHover={{ y: -2 }}
                onClick={() => setText(ex)}
                className="chip-btn border border-white/[0.07] bg-white/[0.025]
                           text-[11px] text-slate-500 hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-300"
              >
                {ex.length > 44 ? ex.slice(0, 44) + "…" : ex}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <motion.button
          className="btn-primary min-w-[150px] px-5 py-2.5"
          onClick={analyze}
          disabled={disabled || analyzing || text.trim().length < 3}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING_SOFT}
        >
          {analyzing ? (
            <>
              <Spinner />
              Analysing…
            </>
          ) : (
            <>
              Analyse with AI
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
