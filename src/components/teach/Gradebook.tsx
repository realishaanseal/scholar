"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Gradebook as GradebookData } from "@/domains/grading";

/**
 * The class, as a grid.
 *
 * A gradebook is one of the few places a table genuinely beats cards: the
 * whole point is comparing down a column and along a row, which no other
 * layout supports. So it is a real table, scrolling horizontally inside its
 * own container rather than pushing the page sideways.
 *
 * The first column stays put while you scroll, because a grid of numbers with
 * the names scrolled off is a grid of anonymous numbers.
 */
export default function Gradebook({ data }: { data: GradebookData }) {
  const [sortByGrade, setSortByGrade] = useState(false);

  if (data.rows.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-200">Nobody is enrolled</p>
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
          Marks appear here once students are added to this class and work has been
          returned to them.
        </p>
      </div>
    );
  }

  if (data.columns.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-200">No published work yet</p>
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-slate-400">
          Publish an assignment and this becomes a grid of who has done what.
        </p>
      </div>
    );
  }

  const rows = sortByGrade
    ? [...data.rows].sort((a, b) => (b.grade.percentage ?? -1) - (a.grade.percentage ?? -1))
    : data.rows;

  const incomplete = data.rows.some((r) => r.grade.weightsIncomplete);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-500">
          {data.rows.length} student{data.rows.length === 1 ? "" : "s"} ·{" "}
          {data.columns.length} published{" "}
          {data.columns.length === 1 ? "assignment" : "assignments"}
        </p>
        <button
          type="button"
          onClick={() => setSortByGrade((v) => !v)}
          className="btn btn-ghost px-3 py-1.5 text-[12.5px]"
        >
          {sortByGrade ? "Sort by name" : "Sort by grade"}
        </button>
      </div>

      {incomplete && data.categories.length > 0 && (
        <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-[12.5px] text-amber-200">
          Category weights do not add up to 100%. Grades are worked out over the
          weights that exist, so they will change when the rest are set.
        </p>
      )}

      {/* Scrolls inside itself; the page never moves sideways. */}
      <div className="card overflow-x-auto rounded-xl">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="sticky start-0 z-10 bg-ink-985 px-3.5 py-2.5 text-start font-medium text-slate-400">
                Student
              </th>
              {data.columns.map((c) => (
                <th
                  key={c.assignmentId}
                  className="px-2.5 py-2.5 text-center font-medium text-slate-400"
                  title={c.title}
                >
                  <span className="block max-w-[92px] truncate">{c.title}</span>
                  {c.points !== null && (
                    <span className="block text-[10.5px] font-normal text-slate-600">
                      /{c.points}
                    </span>
                  )}
                </th>
              ))}
              <th className="sticky end-0 z-10 bg-ink-985 px-3.5 py-2.5 text-end font-medium text-slate-400">
                Grade
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-white/[0.04] last:border-0">
                <td className="sticky start-0 z-10 max-w-[190px] truncate bg-ink-985 px-3.5 py-2.5 text-slate-200">
                  {r.name ?? r.email ?? r.userId.slice(0, 8)}
                </td>

                {data.columns.map((c) => {
                  const cell = r.cells[c.assignmentId];
                  return (
                    <td key={c.assignmentId} className="px-2.5 py-2.5 text-center">
                      <Cell
                        score={cell?.score ?? null}
                        status={cell?.status ?? null}
                        isLate={cell?.isLate ?? false}
                        overdue={Boolean(c.dueAt && Date.parse(c.dueAt) < Date.now())}
                      />
                    </td>
                  );
                })}

                <td className="sticky end-0 z-10 bg-ink-985 px-3.5 py-2.5 text-end">
                  <span className="font-semibold tabular-nums text-slate-100">
                    {r.grade.percentage === null ? "—" : `${r.grade.percentage}%`}
                  </span>
                  {r.grade.awaiting > 0 && (
                    <span className="ms-1.5 text-[10.5px] text-slate-600">
                      +{r.grade.awaiting}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-600">
        Unmarked work is left out of the grade rather than counted as zero — a
        student marked on half of what they have done should not read as 50%. A
        dash means nothing handed in; a dot means handed in and waiting on you.
      </p>
    </div>
  );
}

function Cell({
  score, status, isLate, overdue,
}: {
  score: number | null;
  status: string | null;
  isLate: boolean;
  overdue: boolean;
}) {
  if (score !== null) {
    return (
      <span className={cn("tabular-nums", isLate ? "text-amber-300" : "text-slate-200")}>
        {score}
      </span>
    );
  }
  if (status === "submitted") {
    // Handed in, waiting on the teacher. Distinct from nothing at all.
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" aria-label="Awaiting marking" />;
  }
  return (
    <span className={overdue ? "text-rose-400/70" : "text-slate-700"} aria-label={overdue ? "Missing" : "Not due"}>
      —
    </span>
  );
}
