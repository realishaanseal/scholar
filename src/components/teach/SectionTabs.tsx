"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { SPRING_SNAPPY } from "@/components/motion";
import { cn } from "@/lib/cn";

/**
 * Work, Materials, Students.
 *
 * Three things a teacher does with a class, and they are genuinely different
 * activities rather than views of one list — which is why they are tabs and
 * not sections stacked on a page. The underline is a shared layoutId, so
 * switching moves one marker rather than cross-fading two.
 *
 * State lives in the URL hash rather than only in React, so a teacher who
 * refreshes while marking does not land back on Work.
 */

export type TabKey =
  | "work" | "materials" | "students" | "grades" | "notices" | "register" | "outcomes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "work", label: "Work" },
  { key: "materials", label: "Materials" },
  { key: "students", label: "Students" },
  { key: "grades", label: "Grades" },
  { key: "notices", label: "Notices" },
  { key: "register", label: "Register" },
  { key: "outcomes", label: "How it went" },
];

export default function SectionTabs({
  work,
  materials,
  students,
  grades,
  notices,
  register,
  outcomes,
  counts,
  labels,
}: {
  work: React.ReactNode;
  materials: React.ReactNode;
  /**
   * Omitted on the student view: a roster is a teacher's tool, and a class
   * list is not a student's to browse.
   */
  students?: React.ReactNode;
  /** Omitted on the student view: a class grid is a teacher's tool. */
  grades?: React.ReactNode;
  /** Shown to both, because a notice is for the class. */
  notices?: React.ReactNode;
  /** Teacher only: a register names which children were in a room. */
  register?: React.ReactNode;
  /** Teacher only: what the class found hard, once anything has been marked. */
  outcomes?: React.ReactNode;
  counts?: Partial<Record<TabKey, number>>;
  /**
   * The same shelf is "Materials" to whoever fills it and "Library" to
   * whoever reads from it.
   */
  labels?: Partial<Record<TabKey, string>>;
}) {
  // A tab with nothing behind it is not shown at all, which is how the same
  // component serves a teacher and a student without a mode flag.
  const tabs = TABS.filter(
    (t) =>
      !(t.key === "students" && students === undefined) &&
      !(t.key === "grades" && grades === undefined) &&
      !(t.key === "notices" && notices === undefined) &&
      !(t.key === "register" && register === undefined) &&
      !(t.key === "outcomes" && outcomes === undefined)
  );

  const [active, setActive] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "work";
    const fromHash = window.location.hash.replace("#", "");
    return tabs.some((t) => t.key === fromHash) ? (fromHash as TabKey) : "work";
  });

  function select(key: TabKey) {
    setActive(key);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${key}`);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Class sections"
        className="mb-5 flex gap-1 border-b border-white/[0.07]"
      >
        {tabs.map((tab) => {
          const selected = active === tab.key;
          const count = counts?.[tab.key];
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => select(tab.key)}
              className={cn(
                "relative px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                selected ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {labels?.[tab.key] ?? tab.label}
              {count !== undefined && count > 0 && (
                <span className="ms-1.5 text-[11px] tabular-nums text-slate-500">
                  {count}
                </span>
              )}
              {selected && (
                <motion.span
                  layoutId="section-tab-underline"
                  transition={SPRING_SNAPPY}
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                  style={{ background: "var(--grad-brand)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/*
        All three stay mounted and are hidden rather than unmounted. A half
        typed assignment must survive a glance at the roster, and re-fetching
        the materials list every time someone checks a name is wasteful.
      */}
      <div role="tabpanel" hidden={active !== "work"}>{work}</div>
      <div role="tabpanel" hidden={active !== "materials"}>{materials}</div>
      {students !== undefined && (
        <div role="tabpanel" hidden={active !== "students"}>{students}</div>
      )}
      {grades !== undefined && (
        <div role="tabpanel" hidden={active !== "grades"}>{grades}</div>
      )}
      {notices !== undefined && (
        <div role="tabpanel" hidden={active !== "notices"}>{notices}</div>
      )}
      {register !== undefined && (
        <div role="tabpanel" hidden={active !== "register"}>{register}</div>
      )}
      {outcomes !== undefined && (
        <div role="tabpanel" hidden={active !== "outcomes"}>{outcomes}</div>
      )}
    </div>
  );
}
