"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { fetchJson } from "@/lib/fetchJson";
import TimetableImport from "./TimetableImport";
import ClassList from "./ClassList";
import { NowStrip, TimetableWeek } from "./TimetableWeek";
import type { ClassSlot } from "@/lib/scholar/timetableView";

/**
 * The Timetable page.
 *
 * This used to open straight onto the edit list — which answered "how do I
 * change my timetable" for a page a student actually opens to ask "what have
 * I got, and what's next". So the live view leads now: what's running (or
 * coming) at the top, then the week drawn to scale, with the editing tools
 * folded away underneath and opened on demand. Setup is still one click from
 * here, and it opens automatically when there's nothing imported yet, since
 * that is the only thing worth doing on an empty timetable.
 */
export default function TimetablePanel() {
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  // Only force the setup drawer open on the first load that comes back empty;
  // after that the student's own toggling wins, so collapsing it doesn't get
  // undone by the next refetch.
  const [decidedInitial, setDecidedInitial] = useState(false);

  async function load() {
    const { data } = await fetchJson<{ classes: ClassSlot[] }>("/api/timetable");
    const next = data?.classes ?? [];
    setClasses(next);
    setLoading(false);
    setDecidedInitial((decided) => {
      if (!decided && next.length === 0) setSetupOpen(true);
      return true;
    });
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="card skeleton-shimmer h-[132px]" />
        <div className="card skeleton-shimmer h-[420px]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <NowStrip classes={classes} />
      <TimetableWeek classes={classes} />

      {classes.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          className="card border-dashed p-12 text-center"
        >
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white">No timetable yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
            Paste or upload your school timetable below and Scholar will lay out your week —
            and use the free periods to work out when you can actually study.
          </p>
        </motion.div>
      )}

      {/* ── Setup ──────────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        <button
      type="button"
      onClick={() => setSetupOpen((v) => !v)}
          aria-expanded={setupOpen}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Edit timetable</span>
            <span className="block text-[11px] leading-snug text-slate-500">
              {classes.length > 0
                ? `Import a new one, or fix any of the ${classes.length} period${
                    classes.length === 1 ? "" : "s"
                  } above`
                : "Import your classes to get started"}
            </span>
          </span>
          <motion.span
            className="shrink-0 text-slate-500"
            animate={{ rotate: setupOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {setupOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  Breaks and library periods can be imported too — tag them in the timetable
                  text, or fix the tag on any row below.
                </p>
                <ClassList classes={classes} onChanged={load} />
                {/* Import is the only way in: a manual "add one class" form was
                    redundant next to a whole-timetable import, and a wrong row
                    can be fixed in place above rather than re-added. */}
                <TimetableImport onImported={load} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
