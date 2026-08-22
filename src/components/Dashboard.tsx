"use client";

import { useEffect, useMemo, useState } from "react";
import Capture from "./Capture";
import ReviewCard from "./ReviewCard";
import HomeworkItem from "./HomeworkItem";
import SubjectRail from "./SubjectRail";
import AISetupBanner from "./AISetupBanner";
import AnimatedNumber from "./AnimatedNumber";
import NowCard, { type NowPayload } from "./NowCard";
import FocusMode from "./FocusMode";
import PlanReview from "./PlanReview";
import AlertsFeed, { type RiskSignal } from "./AlertsFeed";
import CoachPanel from "./CoachPanel";
import type { DraftHomework, HomeworkDTO, SubjectDTO } from "@/lib/clientTypes";
import { urgencyOf } from "@/lib/format";
import { fetchJson } from "@/lib/fetchJson";

type Filter = "active" | "all" | "done";

export default function Dashboard({ userName }: { userName: string }) {
  const [homework, setHomework] = useState<HomeworkDTO[]>([]);
  const [subjects, setSubjects] = useState<SubjectDTO[]>([]);
  const [draft, setDraft] = useState<DraftHomework | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [now, setNow] = useState<NowPayload | null>(null);
  const [budgetMins, setBudgetMins] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [syllabus, setSyllabus] = useState<{ syllabus: any; plan: any[]; filename: string } | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);

  async function load() {
    const { data } = await fetchJson<{ homework: HomeworkDTO[]; subjects: SubjectDTO[] }>("/api/homework");
    if (data) {
      setHomework(data.homework);
      setSubjects(data.subjects);
    }
    setLoading(false);
    await loadNow(budgetMins);
  }

  /** Recompute recommendation + workload. The client clock is passed through so
   *  scheduling reflects the student's timezone rather than the server's. */
  async function loadNow(mins: number | null) {
    const params = new URLSearchParams({ now: new Date().toISOString() });
    if (mins) params.set("minutes", String(mins));
    const { data } = await fetchJson<NowPayload>(`/api/scholar/now?${params}`);
    if (data) setNow(data);
  }

  useEffect(() => { load(); }, []);

  function changeBudget(mins: number | null) {
    setBudgetMins(mins);
    loadNow(mins);
  }

  async function saveDraft(d: DraftHomework) {
    setSaving(true);
    const { ok } = await fetchJson("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, details: d.details, subject: d.subject, dueAt: d.dueAt,
        priority: d.priority, estimateMins: d.estimateMins, rawInput: d.rawInput,
        source: d.source, aiConfidence: d.aiConfidence, aiNotes: d.aiNotes,
        attachmentIds: d.attachmentIds ?? [],
      }),
    });
    setSaving(false);
    if (ok) {
      setDraft(null);
      await load();
    }
  }

  async function updateItem(id: string, patch: Record<string, unknown>) {
    setHomework((list) => list.map((h) => (h.id === id ? ({ ...h, ...patch } as HomeworkDTO) : h)));
    await fetch(`/api/homework/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function deleteItem(id: string) {
    setHomework((list) => list.filter((h) => h.id !== id));
    await fetch(`/api/homework/${id}`, { method: "DELETE" });
    await load();
  }

  const visible = useMemo(() => {
    let list = homework;
    if (filter === "active") list = list.filter((h) => h.status !== "done");
    if (filter === "done") list = list.filter((h) => h.status === "done");
    if (subjectFilter) list = list.filter((h) => h.subject?.name === subjectFilter);

    const rank: Record<string, number> = { overdue: 0, today: 1, tomorrow: 2, soon: 3, later: 4, none: 5 };
    const risks = now?.risks ?? {};

    return [...list].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;

      // Prefer the engine's risk score: it accounts for how much work is left
      // against available time, so a big task due tomorrow outranks a trivial
      // one due today. Falls back to deadline buckets before the API responds.
      const sa = risks[a.id]?.score;
      const sb = risks[b.id]?.score;
      if (typeof sa === "number" && typeof sb === "number" && sa !== sb) return sb - sa;

      const ra = rank[urgencyOf(a.status === "done" ? null : a.dueAt)];
      const rb = rank[urgencyOf(b.status === "done" ? null : b.dueAt)];
      if (ra !== rb) return ra - rb;
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [homework, filter, subjectFilter, now]);

  const active = homework.filter((h) => h.status !== "done");
  const overdue = active.filter((h) => urgencyOf(h.dueAt) === "overdue").length;
  const today = active.filter((h) => urgencyOf(h.dueAt) === "today").length;
  const tomorrow = active.filter((h) => urgencyOf(h.dueAt) === "tomorrow").length;
  const knownSubjects = subjects.map((s) => s.name);

  /** Alert actions map onto things the dashboard can already do. */
  function handleSignalAction(signal: RiskSignal) {
    if (signal.kind === "overdue-pileup") {
      setFilter("active");
      setSubjectFilter(null);
      return;
    }
    // Everything else points at a specific task: open it in focus mode.
    const target = signal.taskIds[0];
    if (target && homework.some((h) => h.id === target)) setFocusId(target);
  }

  const focused = focusId ? homework.find((h) => h.id === focusId) ?? null : null;

  // Focus Mode takes over the whole view: the point is to remove everything
  // that isn't the task in hand.
  if (focused) {
    return (
      <FocusMode
        hw={focused}
        onExit={() => { setFocusId(null); load(); }}
        onUpdate={updateItem}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AttentionBar
        overdue={overdue}
        today={today}
        tomorrow={tomorrow}
        active={active.length}
        userName={userName}
      />

      <AISetupBanner />

      <AlertsFeed onAction={handleSignalAction} />

      <NowCard
        data={now}
        homework={homework}
        onStart={(hw) => setFocusId(hw.id)}
        onSetMinutes={changeBudget}
        minutes={budgetMins}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-8">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          {syllabus ? (
            <PlanReview
              syllabus={syllabus.syllabus}
              plan={syllabus.plan}
              filename={syllabus.filename}
              onCommitted={() => { setSyllabus(null); load(); }}
              onDiscard={() => setSyllabus(null)}
            />
          ) : draft ? (
            <ReviewCard
              draft={draft}
              knownSubjects={knownSubjects}
              saving={saving}
              onSave={saveDraft}
              onDiscard={() => setDraft(null)}
            />
          ) : (
            <Capture onDraft={setDraft} onSyllabus={setSyllabus} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              {(["active", "all", "done"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-all duration-200 ${
                    filter === f
                      ? "text-white shadow-glow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  style={filter === f ? { background: "var(--grad-brand)" } : undefined}
                >
                  {f}
                </button>
              ))}
            </div>

            {subjectFilter && (
              <button
                onClick={() => setSubjectFilter(null)}
                className="chip-btn animate-popIn border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.10]"
              >
                {subjectFilter}
                <span className="text-slate-500">✕</span>
              </button>
            )}

            <span className="ml-auto text-xs tabular-nums text-slate-500">
              {visible.length} shown
            </span>
          </div>

          <div className="space-y-3">
            {loading && [0, 1, 2].map((i) => (
              <div key={i} className="card skeleton-shimmer h-[92px] animate-fadeIn stagger" style={{ ["--i" as any]: i }} />
            ))}

            {!loading && visible.length === 0 && (
              <div className="card animate-riseIn border-dashed p-14 text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">
                  {homework.length === 0
                    ? "Nothing here yet. Add your first assignment above — type it or just say it."
                    : "Nothing matches this filter."}
                </p>
              </div>
            )}

            {!loading && visible.map((hw, i) => (
              <div key={hw.id} className="animate-riseIn stagger" style={{ ["--i" as any]: Math.min(i, 12) }}>
                <HomeworkItem
                  hw={hw}
                  knownSubjects={knownSubjects}
                  risk={now?.risks?.[hw.id] ?? null}
                  onFocus={() => setFocusId(hw.id)}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Side rail ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          {coachOpen ? (
            <CoachPanel onClose={() => setCoachOpen(false)} />
          ) : (
            <button
              onClick={() => setCoachOpen(true)}
              className="card card-hover flex w-full items-center gap-3 p-4 text-left"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: "var(--grad-brand)" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-white">Ask the study coach</span>
                <span className="block text-[11px] text-slate-500">
                  &ldquo;What should I do tonight?&rdquo;
                </span>
              </span>
            </button>
          )}

          <SubjectRail
          homework={homework}
          subjects={subjects}
          selected={subjectFilter}
          onSelect={setSubjectFilter}
          />
        </div>
      </div>
    </div>
  );
}

function AttentionBar({
  overdue, today, tomorrow, active, userName,
}: { overdue: number; today: number; tomorrow: number; active: number; userName: string }) {
  const urgent = overdue + today;

  const accent =
    overdue > 0
      ? { glow: "rgba(239,68,68,0.16)", ring: "border-red-500/25" }
      : today > 0
      ? { glow: "rgba(249,115,22,0.14)", ring: "border-orange-500/25" }
      : { glow: "rgba(91,124,250,0.13)", ring: "border-white/[0.08]" };

  return (
    <section
      className={`card animate-riseIn overflow-hidden ${accent.ring} p-5 sm:p-6 xl:p-7`}
      style={{ boxShadow: `0 18px 50px -20px rgba(0,0,0,0.85), inset 0 0 80px -40px ${accent.glow}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl xl:text-[26px]">
            {urgent > 0 ? (
              <>
                <span className="gradient-text">{urgent}</span>{" "}
                <span className="text-white">
                  thing{urgent === 1 ? "" : "s"} need{urgent === 1 ? "s" : ""} you now
                </span>
              </>
            ) : (
              <span className="gradient-text">You&apos;re on top of it, {userName}</span>
            )}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {overdue > 0 && <span className="font-medium text-red-300">{overdue} overdue</span>}
            {overdue > 0 && (today > 0 || tomorrow > 0) && <span className="text-slate-600"> · </span>}
            {today > 0 && <span className="font-medium text-orange-300">{today} due today</span>}
            {today > 0 && tomorrow > 0 && <span className="text-slate-600"> · </span>}
            {tomorrow > 0 && <span className="font-medium text-amber-300">{tomorrow} due tomorrow</span>}
            {urgent === 0 && tomorrow === 0 &&
              `${active} open assignment${active === 1 ? "" : "s"}, nothing due in the next 24 hours.`}
          </p>
        </div>

        {/* Four fixed-width tiles overflow a phone; a 2×2 grid keeps them readable. */}
        <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:gap-3">
          <Stat label="Overdue" value={overdue} tone="#ef4444" muted={overdue === 0} />
          <Stat label="Today" value={today} tone="#f97316" muted={today === 0} />
          <Stat label="Tomorrow" value={tomorrow} tone="#f59e0b" muted={tomorrow === 0} />
          <Stat label="Open" value={active} tone="#7d9bff" muted={false} />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: number; tone: string; muted: boolean }) {
  return (
    <div
      className="card-hover relative min-w-[84px] overflow-hidden rounded-xl border border-white/[0.07] px-4 py-3 text-center"
      style={{
        background: muted
          ? "rgba(8,10,18,0.5)"
          : `linear-gradient(180deg, ${tone}1f 0%, rgba(8,10,18,0.5) 70%)`,
      }}
    >
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{ color: muted ? "#64748b" : tone }}
      >
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}
