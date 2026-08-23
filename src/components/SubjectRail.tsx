"use client";

import type { HomeworkDTO, SubjectDTO } from "@/lib/clientTypes";
import { formatDue, urgencyOf } from "@/lib/format";

/**
 * Right-hand rail: how work is spread across subjects, and what's coming next.
 * Gives the wide layout something worth the space instead of just stretching.
 */
export default function SubjectRail({
  homework,
  subjects,
  selected,
  onSelect,
}: {
  homework: HomeworkDTO[];
  subjects: SubjectDTO[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const active = homework.filter((h) => h.status !== "done");
  const maxCount = Math.max(1, ...subjects.map((s) => active.filter((h) => h.subject?.name === s.name).length));

  const upNext = active
    .filter((h) => h.dueAt)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 5);

  const done = homework.filter((h) => h.status === "done").length;
  const pct = homework.length ? Math.round((done / homework.length) * 100) : 0;

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      {/* Progress ring */}
      <div className="card animate-riseIn p-5">
        <div className="flex items-center gap-4">
          <ProgressRing pct={pct} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Completion</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {done} of {homework.length} assignment{homework.length === 1 ? "" : "s"} finished
              {homework.length === 0 && " — nothing logged yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Subject spread */}
      <div className="card animate-riseIn stagger p-5" style={{ ["--i" as any]: 1 }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">By subject</h3>
          {selected && (
            <button onClick={() => onSelect(null)} className="text-[11px] text-vx-300 hover:text-vx-200">
              Clear
            </button>
          )}
        </div>

        {subjects.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            Subjects appear here automatically as the AI categorises your work.
          </p>
        ) : (
          <div className="space-y-3">
            {subjects.map((s, i) => {
              const count = active.filter((h) => h.subject?.name === s.name).length;
              const isOn = selected === s.name;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(isOn ? null : s.name)}
                  className="group block w-full text-left"
                  style={{ ["--i" as any]: i }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span
                      className={`flex min-w-0 items-center gap-2 text-xs transition-colors ${
                        isOn ? "text-white" : "text-slate-300 group-hover:text-white"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full transition-transform group-hover:scale-125"
                        style={{ background: s.color, boxShadow: `0 0 10px ${s.color}88` }}
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-smooth"
                      style={{
                        width: `${(count / maxCount) * 100}%`,
                        background: `linear-gradient(90deg, ${s.color}, ${s.color}77)`,
                        boxShadow: isOn ? `0 0 14px ${s.color}aa` : "none",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Up next */}
      <div className="card animate-riseIn stagger p-5" style={{ ["--i" as any]: 2 }}>
        <h3 className="mb-4 text-sm font-semibold text-white">Up next</h3>

        {upNext.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            Nothing with a deadline yet. Add one and it'll show up here.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-white/[0.08] pl-4">
            {upNext.map((h) => {
              const u = urgencyOf(h.dueAt);
              const dot =
                u === "overdue" ? "#ef4444" : u === "today" ? "#f97316" : u === "tomorrow" ? "#f59e0b" : h.subject?.color ?? "#5b7cfa";
              return (
                <li key={h.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-ink-985"
                    style={{ background: dot, boxShadow: `0 0 10px ${dot}` }}
                  />
                  <div className="text-xs font-medium leading-snug text-slate-200 line-clamp-2">{h.title}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: dot }}>
                    {formatDue(h.dueAt)}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "hsl(var(--accent-h) var(--accent-s) var(--accent-l))" }} />
            <stop offset="60%" style={{ stopColor: "hsl(var(--accent-h-2) var(--accent-s) var(--accent-l))" }} />
            <stop offset="100%" style={{ stopColor: "hsl(calc(var(--accent-h) - 25) var(--accent-s) calc(var(--accent-l) + 15%))" }} />
          </linearGradient>
        </defs>
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle
          cx="34" cy="34" r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-white">
        {pct}%
      </div>
    </div>
  );
}
