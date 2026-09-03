"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { EASE_OUT, Reveal } from "@/components/motion";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import QuizEditor from "./QuizEditor";
import type { Assignment } from "@/domains/assessment";

/**
 * The teacher's working surface for one section.
 *
 * Organised around the question a teacher actually arrives with — "what needs
 * me?" — rather than around the data model. Drafts and published work are one
 * list ordered by deadline, with state shown as a property of each row,
 * because a teacher thinks in terms of the week ahead rather than in terms of
 * two separate collections.
 */

type Props = {
  sectionId: string;
  courseId: string;
  initialAssignments: Assignment[];
  enrolledCount: number;
};

type Banner = { kind: "ok" | "error"; text: string } | null;

/** Mirrors CollisionWarning, kept local so no server module is imported. */
type Clash = { severity: "high" | "medium"; message: string };

export default function SectionWorkbench({
  sectionId,
  courseId,
  initialAssignments,
  enrolledCount,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const { drafts, live } = useMemo(() => {
    return {
      drafts: assignments.filter((a) => a.status !== "published"),
      live: assignments.filter((a) => a.status === "published"),
    };
  }, [assignments]);

  const replace = useCallback((next: Assignment) => {
    setAssignments((prev) => prev.map((a) => (a.id === next.id ? next : a)));
  }, []);

  async function publish(assignment: Assignment) {
    setBusyId(assignment.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/institution/assignments/${assignment.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not publish.");

      replace(data.assignment);
      // The count is the point: publishing to an empty section is a mistake
      // that otherwise looks exactly like success.
      setBanner({
        kind: data.projectedToStudents > 0 ? "ok" : "error",
        text:
          data.projectedToStudents > 0
            ? `Published. It is now on ${data.projectedToStudents} student${
                data.projectedToStudents === 1 ? "'s" : "s'"
              } dashboard.`
            : "Published, but nobody is enrolled in this section yet — no student has it.",
      });
    } catch (err) {
      setBanner({ kind: "error", text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(assignment: Assignment) {
    setBusyId(assignment.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/institution/assignments/${assignment.id}/publish`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not withdraw.");
      replace(data.assignment);
      setBanner({
        kind: "ok",
        text: "Withdrawn. Students' tasks are archived — any time they logged is kept.",
      });
    } catch (err) {
      setBanner({ kind: "error", text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-400">
          {enrolledCount === 0 ? (
            <span className="text-amber-400/90">
              No students are enrolled yet — published work will reach nobody.
            </span>
          ) : (
            <>
              {enrolledCount} student{enrolledCount === 1 ? "" : "s"} enrolled
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="btn-primary px-3.5 py-2 text-[13px]"
        >
          New assignment
        </button>
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className={cn(
              "mb-4 overflow-hidden rounded-lg border px-3.5 py-2.5 text-[13px]",
              banner.kind === "ok"
                ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200"
                : "border-amber-400/20 bg-amber-400/[0.07] text-amber-200"
            )}
          >
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>

      {assignments.length === 0 ? (
        <EmptyState onCreate={() => setComposing(true)} />
      ) : (
        <div className="space-y-6">
          {drafts.length > 0 && (
            <Group title="Drafts" hint="Only you can see these.">
              {drafts.map((a, i) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  index={i}
                  busy={busyId === a.id}
                  courseId={courseId}
                  onPublish={() => publish(a)}
                  onWithdraw={() => withdraw(a)}
                />
              ))}
            </Group>
          )}
          {live.length > 0 && (
            <Group title="Published" hint="On students' dashboards now.">
              {live.map((a, i) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  index={i}
                  busy={busyId === a.id}
                  courseId={courseId}
                  onPublish={() => publish(a)}
                  onWithdraw={() => withdraw(a)}
                />
              ))}
            </Group>
          )}
        </div>
      )}

      <Composer
        open={composing}
        sectionId={sectionId}
        onClose={() => setComposing(false)}
        onCreated={(a) => {
          setAssignments((prev) => [a, ...prev]);
          setComposing(false);
          setBanner({
            kind: "ok",
            text: "Saved as a draft. Publish it when you are ready for students to see it.",
          });
        }}
      />
    </div>
  );
}

function Group({
  title, hint, children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold tracking-tight text-slate-200">{title}</h2>
        <span className="text-[11.5px] text-slate-500">{hint}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AssignmentRow({
  assignment, index, busy, courseId, onPublish, onWithdraw,
}: {
  assignment: Assignment;
  index: number;
  busy: boolean;
  courseId: string;
  onPublish: () => void;
  onWithdraw: () => void;
}) {
  const published = assignment.status === "published";
  const isQuiz = assignment.kind === "quiz";
  const [open, setOpen] = useState(false);

  return (
    <Reveal y={8} delay={Math.min(index * 0.03, 0.18)}>
      <div className="card rounded-xl">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-slate-100">
              {assignment.title}
              {isQuiz && (
                <span className="ms-2 rounded-full bg-white/[0.06] px-2 py-0.5 align-middle text-[10.5px] font-normal text-slate-400">
                  Quiz
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {assignment.dueAt ? `Due ${formatDue(assignment.dueAt)}` : "No deadline"}
              {assignment.points !== null && ` · ${assignment.points} marks`}
            </p>
          </div>

          {isQuiz && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="btn btn-ghost shrink-0 px-3 py-1.5 text-[12.5px]"
            >
              {open ? "Done" : "Questions"}
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={published ? onWithdraw : onPublish}
            className={cn(
              "shrink-0 text-[12.5px]",
              published
                ? "btn btn-ghost px-3 py-1.5"
                : "btn-primary px-3 py-1.5"
            )}
          >
            {busy ? "…" : published ? "Withdraw" : "Publish"}
          </button>
        </div>

        {isQuiz && open && (
          <div className="border-t border-white/[0.06] px-4 py-4">
            <QuizEditor
              assignmentId={assignment.id}
              courseId={courseId}
              published={published}
            />
          </div>
        )}
      </div>
    </Reveal>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
      <p className="text-[14px] font-medium text-slate-200">No assignments yet</p>
      <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate-400">
        When you publish one, it appears on every enrolled student&apos;s dashboard with
        your deadline — and they keep their own estimate and planning around it.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary mt-5 px-3.5 py-2 text-[13px]"
      >
        Create the first one
      </button>
    </div>
  );
}

/* ── Composer ──────────────────────────────────────────────────────────── */

function Composer({
  open, sectionId, onClose, onCreated,
}: {
  open: boolean;
  sectionId: string;
  onClose: () => void;
  onCreated: (a: Assignment) => void;
}) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState("");
  const [estimate, setEstimate] = useState("");
  const [kind, setKind] = useState<"task" | "quiz">("task");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);

  /**
   * Ask whether the class is already busy that day.
   *
   * Fired when the teacher leaves the date field rather than on every
   * keystroke: a datetime input passes through a dozen invalid states while
   * being typed, and warning about each would be noise.
   */
  async function checkDay(value: string, mins: string) {
    if (!value) {
      setClash(null);
      return;
    }
    const day = value.slice(0, 10);
    const q = new URLSearchParams({ day });
    if (mins.trim() !== "") q.set("mins", mins.trim());

    try {
      const res = await fetch(
        `/api/institution/sections/${sectionId}/deadline-check?${q}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setClash(data.warning ?? null);
    } catch {
      // A warning that cannot be fetched is not worth an error message. The
      // teacher is mid-sentence; the deadline still works.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/institution/sections/${sectionId}/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          title,
          instructions,
          // datetime-local has no zone; the browser's own offset is the right
          // reading of what the teacher typed.
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          points: points ? Number(points) : null,
          estimatedMins: estimate ? Number(estimate) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");

      onCreated(data.assignment);
      setTitle(""); setInstructions(""); setDueAt(""); setPoints(""); setEstimate("");
      setKind("task");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent open={open} size="sheet" className="p-0">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <DialogTitle>New assignment</DialogTitle>
            <DialogDescription className="mt-1">
              Saved as a draft. Nothing reaches students until you publish it.
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field label="Kind">
              <div className="flex gap-1.5">
                {([
                  { id: "task", label: "Written work", hint: "They hand something in" },
                  { id: "quiz", label: "Quiz", hint: "They answer questions" },
                ] as const).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-start transition-colors",
                      kind === k.id
                        ? "border-vx-400/50 bg-vx-400/[0.08]"
                        : "border-white/[0.07] hover:border-white/[0.16]"
                    )}
                  >
                    <span className="block text-[13px] text-slate-200">{k.label}</span>
                    <span className="block text-[11px] text-slate-500">{k.hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Title">
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === "quiz" ? "Chapter 4 test" : "Problem set 4"}
                className="input w-full"
              />
            </Field>

            <Field label="Instructions">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={5}
                placeholder={
                  kind === "quiz"
                    ? "Anything they should know before starting."
                    : "Questions 1–12. Show your working."
                }
                className="input w-full resize-y"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Due">
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  onBlur={(e) => void checkDay(e.target.value, estimate)}
                  className="input w-full"
                />
              </Field>
              <Field label="Marks">
                <input
                  type="number" min="0" step="0.5"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="20"
                  className="input w-full"
                />
              </Field>
              <Field label="Est. minutes" hint="Starting point only">
                <input
                  type="number" min="1"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="45"
                  className="input w-full"
                />
              </Field>
            </div>

            {/* Said while the date can still be changed painlessly, and never
                as a refusal: a teacher may have a good reason for a crowded
                week, and being overruled by a heuristic would be resented most
                in the cases where the heuristic was right. */}
            {clash && (
              <p
                className={
                  clash.severity === "high"
                    ? "rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200"
                    : "rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-400"
                }
              >
                {clash.message}
              </p>
            )}

            <p className="text-[12px] leading-relaxed text-slate-500">
              Your estimate seeds each student&apos;s task once. After that it is theirs —
              a student who knows this course takes them longer keeps their own number.
            </p>

            {error && <p className="text-[13px] text-rose-300">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-[13px] text-slate-300 hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || title.trim().length < 2}
              className="btn-primary px-3.5 py-2 text-[13px]"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-medium text-slate-300">
        {label}
        {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}
