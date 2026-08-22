import type { ParsedSyllabus, SyllabusAssessment } from "./syllabus";

/**
 * Turn assessments into a dated study plan by working backward from each deadline.
 *
 * Deliberately deterministic rather than model-generated: the student needs to
 * be able to look at the plan and see why each session sits where it does, and
 * a schedule that shuffles on every re-run is not something anyone can trust.
 *
 * The shape for an exam is a spaced ramp — content sessions first, then practice,
 * then a final review the day before — because that ordering is what makes the
 * plan pedagogically useful rather than just N evenly-spaced blocks.
 */

export type PlannedSession = {
  title: string;
  subject: string;
  /** ISO datetime this session is scheduled for. */
  dueAt: string;
  estimateMins: number;
  priority: "low" | "normal" | "high";
  details: string;
  /** Which assessment this session is preparing for. */
  forAssessment: string;
};

export type PlanOptions = {
  now?: Date;
  /** Default length of a single study session. */
  sessionMins?: number;
  /** Hour of day sessions are scheduled at. */
  hour?: number;
  /** Cap on total generated sessions, so a dense syllabus can't create hundreds. */
  maxSessions?: number;
};

const DAY_MS = 86_400_000;

export function buildStudyPlan(syllabus: ParsedSyllabus, options: PlanOptions = {}): PlannedSession[] {
  const now = options.now ?? new Date();
  const sessionMins = options.sessionMins ?? 60;
  const hour = options.hour ?? 17;
  const maxSessions = options.maxSessions ?? 40;

  const sessions: PlannedSession[] = [];

  // Nearest deadline first, so if the cap truncates the plan it's the distant
  // work that gets dropped rather than the urgent work.
  const dated = syllabus.assessments
    .filter((a) => a.dueAt && new Date(a.dueAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

  for (const assessment of dated) {
    if (sessions.length >= maxSessions) break;
    const due = new Date(assessment.dueAt!);
    const daysAvailable = Math.floor((due.getTime() - now.getTime()) / DAY_MS);
    if (daysAvailable < 1) continue;

    const plan = sessionsFor(assessment, syllabus.subject, {
      now, due, daysAvailable, sessionMins, hour,
    });

    for (const s of plan) {
      if (sessions.length >= maxSessions) break;
      sessions.push(s);
    }
  }

  return sessions.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

function sessionsFor(
  assessment: SyllabusAssessment,
  subject: string,
  ctx: { now: Date; due: Date; daysAvailable: number; sessionMins: number; hour: number }
): PlannedSession[] {
  const { due, daysAvailable, sessionMins, hour } = ctx;
  const isExam = assessment.kind === "exam";

  // Exams warrant spaced preparation; a quiz or a single assignment does not.
  // How many sessions is bounded by how much runway actually exists.
  const topics = assessment.topics.length > 0 ? assessment.topics : [];
  const wanted = isExam
    ? Math.min(6, Math.max(2, topics.length + 2))
    : assessment.kind === "project"
    ? 3
    : 1;

  const count = Math.max(1, Math.min(wanted, daysAvailable));

  // Spread across the runway, but never more than ~3 weeks out — planning a
  // revision session a month ahead of an exam is noise, not help.
  const span = Math.min(daysAvailable, isExam ? 21 : 10);
  const step = count > 1 ? span / count : span;

  const out: PlannedSession[] = [];

  for (let i = 0; i < count; i++) {
    // i = 0 is the session closest to the deadline, so labels ramp correctly.
    const daysBefore = Math.max(1, Math.round(step * i) + 1);
    const when = new Date(due.getTime() - daysBefore * DAY_MS);
    when.setHours(hour, 0, 0, 0);

    // Slipping past "now" means the runway is tighter than the ideal spacing;
    // the session still belongs, it just has to happen sooner.
    if (when.getTime() <= ctx.now.getTime()) {
      const soon = new Date(ctx.now.getTime() + 2 * 60 * 60 * 1000);
      when.setTime(soon.getTime());
    }

    out.push({
      title: sessionTitle(assessment, i, count, topics, isExam),
      subject,
      dueAt: when.toISOString(),
      estimateMins: sessionMins,
      priority: isExam && i === 0 ? "high" : "normal",
      details: `Preparation for ${assessment.title}${
        assessment.weightPercent ? ` (${assessment.weightPercent}% of the grade)` : ""
      }.`,
      forAssessment: assessment.title,
    });
  }

  return out;
}

function sessionTitle(
  assessment: SyllabusAssessment,
  index: number,
  count: number,
  topics: string[],
  isExam: boolean
): string {
  if (!isExam) {
    return count === 1 ? assessment.title : `${assessment.title} — part ${count - index}`;
  }

  // index 0 sits closest to the exam, so the final passes come first here.
  if (index === 0) return `${assessment.title} — full revision`;
  if (index === 1) return `${assessment.title} — practice problems`;

  // Remaining sessions walk back through the content. index counts backward from
  // the exam, so the largest index (furthest out) must map to the FIRST topic —
  // that ordering is what makes the plan read correctly in chronological order.
  const contentOrdinal = index - 2;              // 0, 1, 2, … going back in time
  const topicIndex = topics.length - 1 - contentOrdinal;
  const topic = topicIndex >= 0 ? topics[topicIndex] : undefined;

  return topic
    ? `${assessment.title} — ${topic}`
    : `${assessment.title} — revision ${count - index}`;
}
