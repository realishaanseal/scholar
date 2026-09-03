"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT, Reveal } from "@/components/motion";
import { cn } from "@/lib/cn";
import QuizRunner from "./QuizRunner";
// Straight from the pure module, not the domain barrel: the barrel re-exports
// the repository, which imports the database, which would put pg in the
// browser bundle. The type import is erased at build time and costs nothing.
import { evaluateSubmission } from "@/domains/assessment/projection";
import type { StudentAssignment } from "@/domains/learning";
import type { WorkPlan } from "@/domains/insight/plan";
import { deadlineSentence, deadlineView } from "@/lib/time";

/**
 * Coursework, from the student's side.
 *
 * One list, expandable in place. A separate page per assignment would mean
 * three navigations to answer "what is this and have I done it", which is the
 * only question being asked.
 *
 * The state shown is the student's own: not submitted, submitted, or marked.
 * That is the difference between a list of work and a list of obligations, and
 * only the second is useful when you are the one who owes it.
 */

type AttachedFile = {
  id: string;
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
};

export default function CourseWork({
  assignments: initial,
  plans = [],
  timezone = "UTC",
}: {
  assignments: StudentAssignment[];
  /** Scholar's view of the same work: how long, and how late it can be left. */
  plans?: WorkPlan[];
  /** The institution's zone — the clock these deadlines were written against. */
  timezone?: string;
}) {
  const [assignments, setAssignments] = useState(initial);
  const planFor = new Map(plans.map((p) => [p.assignmentId, p]));

  if (assignments.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-200">No work set yet</p>
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
          When your teacher publishes something it appears here, and on your homework
          list with the deadline already filled in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {assignments.map((a, i) => (
        <Reveal key={a.id} y={8} delay={Math.min(i * 0.03, 0.18)}>
          <AssignmentCard
            assignment={a}
            plan={planFor.get(a.id)}
            timezone={timezone}
            onSubmitted={(next) =>
              setAssignments((prev) => prev.map((x) => (x.id === next.id ? next : x)))
            }
          />
        </Reveal>
      ))}
    </div>
  );
}

function AssignmentCard({
  assignment,
  plan,
  timezone,
  onSubmitted,
}: {
  assignment: StudentAssignment;
  plan?: WorkPlan;
  timezone: string;
  onSubmitted: (a: StudentAssignment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<AttachedFile[] | null>(null);
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<
    { id: string; kind: any; prompt: string; points: number; options?: { id: string; body: string }[] }[]
    | null
  >(null);
  const [sitting, setSitting] = useState(false);

  const sub = assignment.submission;
  const marked = sub?.status === "returned";
  const handedIn = sub?.status === "submitted" || marked;

  // The same function the server uses, so what the interface promises and what
  // the API does cannot drift.
  const verdict = evaluateSubmission(
    {
      availableFrom: assignment.availableFrom,
      dueAt: assignment.dueAt,
      closesAt: assignment.closesAt,
      latePolicy: assignment.latePolicy,
    },
    new Date()
  );

  async function expand() {
    const next = !open;
    setOpen(next);
    if (next && files === null && assignment.attachmentCount > 0) {
      const res = await fetch(`/api/institution/assignments/${assignment.id}/files`);
      const data = await res.json().catch(() => ({ files: [] }));
      setFiles(res.ok ? data.files : []);
    }
  }

  async function startQuiz() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/institution/assignments/${assignment.id}/quiz`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open this quiz.");
      setQuiz(data.questions ?? []);
      setSitting(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/institution/assignments/${assignment.id}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, url: url.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit.");

      onSubmitted({ ...assignment, submission: data.submission });
      setBody("");
      setUrl("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => void expand()}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors hover:bg-white/[0.02]"
      >
        <StatusDot handedIn={handedIn} marked={marked} overdue={!handedIn && isOverdue(assignment)} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-slate-100">{assignment.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-slate-500">
            {assignment.dueAt ? dueLabel(assignment.dueAt, handedIn) : "No deadline"}
            {assignment.attachmentCount > 0 &&
              ` · ${assignment.attachmentCount} attachment${assignment.attachmentCount === 1 ? "" : "s"}`}
          </p>
        </div>

        {marked && sub && (
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-300">
            {sub.score === null ? "Marked" : `${sub.score}${assignment.points !== null ? `/${assignment.points}` : ""}`}
          </span>
        )}
        {handedIn && !marked && (
          <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">
            Handed in
          </span>
        )}

        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
          className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="space-y-4 px-4 py-4">
              {/* What a course cannot tell you on its own. Shown only while
                  the work is still outstanding: once it is handed in, how long
                  it was going to take stopped being useful advice. */}
              {assignment.dueAt && <DeadlineLine iso={assignment.dueAt} timezone={timezone} />}

              {plan && !handedIn && <PlanLine plan={plan} />}

              {assignment.instructions ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">
                  {assignment.instructions}
                </p>
              ) : (
                <p className="text-[12.5px] italic text-slate-500">No instructions given.</p>
              )}

              {assignment.attachmentCount > 0 && (
                <div className="space-y-1.5">
                  {files === null ? (
                    <div className="skeleton-shimmer h-9 rounded-lg" />
                  ) : (
                    files.map((f) => (
                      <a
                        key={f.id}
                        href={f.downloadUrl}
                        className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] px-3 py-2 text-[12.5px] text-slate-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.03]"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                             className="shrink-0 text-slate-500">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7"
                                stroke="currentColor" strokeWidth="1.8"
                                strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {formatSize(f.sizeBytes)}
                        </span>
                      </a>
                    ))
                  )}
                </div>
              )}

              {/* What has already been handed in, and what came back. */}
              {sub && (
                <div className="rounded-lg bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[11.5px] uppercase tracking-wide text-slate-500">
                    Attempt {sub.attempt}
                    {sub.isLate && " · late"}
                    {sub.submittedAt && ` · ${new Date(sub.submittedAt).toLocaleDateString()}`}
                  </p>
                  {sub.body && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-400">
                      {sub.body}
                    </p>
                  )}
                  {marked && sub.feedback && (
                    <p className="mt-2 border-t border-white/[0.06] pt-2 text-[12.5px] leading-relaxed text-emerald-200/90">
                      {sub.feedback}
                    </p>
                  )}
                </div>
              )}

              {/* Submitting again is allowed while the window is open, because
                  a student who spots a mistake before the deadline should be
                  able to fix it. */}
              {verdict.accepted && assignment.kind === "quiz" ? (
                sitting && quiz ? (
                  <QuizRunner
                    assignmentId={assignment.id}
                    questions={quiz}
                    onFinished={() => { setSitting(false); location.reload(); }}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {verdict.late && (
                      <p className="text-[12px] text-amber-300/90">
                        The deadline has passed — this attempt will be marked late.
                      </p>
                    )}
                    <p className="text-[12.5px] leading-relaxed text-slate-400">
                      {handedIn
                        ? "You have already sat this. Starting again uses another attempt."
                        : "Once you start, your answers are marked as soon as you hand in."}
                    </p>
                    {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startQuiz()}
                      className="btn-primary px-3.5 py-2 text-[13px] disabled:opacity-50"
                    >
                      {busy ? "Opening…" : handedIn ? "Sit it again" : "Start quiz"}
                    </button>
                  </div>
                )
              ) : verdict.accepted ? (
                <div className="space-y-2.5">
                  {verdict.late && (
                    <p className="text-[12px] text-amber-300/90">
                      The deadline has passed — this will be marked late.
                    </p>
                  )}
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder={handedIn ? "Submit a revised answer…" : "Your answer…"}
                    className="input w-full resize-y text-[13px]"
                  />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Or a link to your work (optional)"
                    className="input w-full text-[13px]"
                  />
                  {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
                  <button
                    type="button"
                    disabled={busy || (!body.trim() && !url.trim())}
                    onClick={() => void submit()}
                    className="btn-primary px-3.5 py-2 text-[13px]"
                  >
                    {busy ? "Submitting…" : handedIn ? "Submit again" : "Hand in"}
                  </button>
                </div>
              ) : (
                <p className="rounded-lg border border-white/[0.07] px-3 py-2.5 text-[12.5px] text-slate-400">
                  {verdict.reason === "not-open-yet"
                    ? "This is not open for submission yet."
                    : verdict.reason === "closed"
                      ? "Submissions have closed."
                      : "The deadline has passed and late work is not accepted."}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * State at a glance.
 *
 * Colour carries the meaning here rather than decorating it: overdue is the
 * only thing that needs attention, so it is the only thing that is loud.
 */
/**
 * Scholar's plan for one piece of work.
 *
 * Says the number and then says where it came from. An estimate a student
 * cannot interrogate is one they will either follow blindly or ignore
 * entirely, and both are worse than an estimate they can argue with — which
 * is why the reason is written out rather than hidden behind a tooltip.
 */
/**
 * The deadline, said the way both people involved would say it.
 *
 * Only rendered when the reader's clock disagrees with the school's — which
 * is almost never, and exactly the case where getting it wrong costs someone
 * a late mark they did not earn. The reader's own time leads because that is
 * what they plan against; the school's follows because that is what they are
 * held to.
 *
 * The reader's zone comes from the browser rather than from their saved
 * profile: it is always right, including for the student who is abroad this
 * week and has not told anyone.
 */
function DeadlineLine({ iso, timezone }: { iso: string; timezone: string }) {
  const view = deadlineView(
    iso,
    timezone,
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null
  );

  if (!view.differs) return null;

  return (
    <p
      className={
        view.crossesDay
          ? "rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200"
          : "rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-400"
      }
    >
      {deadlineSentence(view)}
    </p>
  );
}

function PlanLine({ plan }: { plan: WorkPlan }) {
  const { plan: when } = plan;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {plan.expectedMins !== null && (
          <span className="text-[13px] font-medium text-slate-200">
            About {formatMins(plan.expectedMins)}
          </span>
        )}

        {when.kind === "start-by" && (
          <span className="text-[12.5px] text-slate-400">
            · start by{" "}
            {new Date(when.startBy).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
        {when.kind === "start-now" && (
          <span className="text-[12.5px] text-amber-300">· start today to finish in time</span>
        )}
        {when.kind === "too-late" && (
          <span className="text-[12.5px] text-rose-300">
            · about {formatMins(when.shortfallMins)} short of the time you have
          </span>
        )}
      </div>

      {/* The workings. A student who disagrees can see exactly what Scholar
          assumed, which is the difference between a tool and an oracle. */}
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
        {plan.reason}
        {when.kind === "too-late" &&
          " Worth telling your teacher now, while there is still time to do something about it."}
      </p>
    </div>
  );
}

function formatMins(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function StatusDot({
  handedIn, marked, overdue,
}: {
  handedIn: boolean;
  marked: boolean;
  overdue: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        marked
          ? "bg-emerald-400"
          : handedIn
            ? "bg-slate-500"
            : overdue
              ? "bg-rose-400"
              : "bg-[hsl(var(--accent-h)_var(--accent-s)_var(--accent-l))]"
      )}
    />
  );
}

function isOverdue(a: StudentAssignment): boolean {
  return Boolean(a.dueAt && Date.parse(a.dueAt) < Date.now());
}

function dueLabel(iso: string, handedIn: boolean): string {
  const due = new Date(iso);
  const diff = due.getTime() - Date.now();
  const day = due.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (handedIn) return `Was due ${day}`;
  if (diff < 0) {
    const days = Math.floor(-diff / 86400000);
    return days === 0 ? `Overdue since ${time}` : `${days}d overdue`;
  }
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `Due in ${Math.max(1, hours)}h · ${time}`;
  return `Due ${day}, ${time}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
