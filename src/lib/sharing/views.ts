import { db } from "../db";
import { buildAnalytics } from "../scholar/analytics";
import { getAvailability, paceBySubject } from "../scholar/memory";
import { analyseWorkload } from "../scholar/workload";
import { expectedRemainingMins } from "../scholar/priority";
import { listHomework } from "../queries";
import { toScorable } from "../scholar/snapshot";
import { requireScope } from "./store";
import type { ShareScope } from "./model";

/**
 * The only code in the app that reads one person's data on behalf of another.
 *
 * Each function takes the viewer, gets the subject back from `requireScope`,
 * and then returns a deliberately reduced shape. The reduction happens HERE,
 * server-side, not in the UI: a view that returned full task rows and trusted
 * the client to hide fields would be one `curl` away from a privacy breach.
 */

export type WorkloadSummaryView = {
  scope: "workload-summary";
  openCount: number;
  overdueCount: number;
  dueThisWeek: number;
  /** Rounded to the nearest half hour — precision here isn't useful and invites over-reading. */
  estimatedHours: number;
  headline: string;
};

export async function workloadSummaryFor(
  viewerUserId: string,
  grantId: string,
  now = new Date()
): Promise<WorkloadSummaryView> {
  const subjectUserId = await requireScope(viewerUserId, grantId, "workload-summary");

  const profile = await getAvailability(subjectUserId);
  const pace = await paceBySubject(subjectUserId);
  const tasks = (await listHomework(subjectUserId)).map(toScorable);
  const open = tasks.filter((t) => t.status !== "done");

  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);

  const overdueCount = open.filter(
    (t) => t.dueAt && new Date(t.dueAt).getTime() < now.getTime()
  ).length;

  const dueThisWeek = open.filter((t) => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt).getTime();
    return d >= now.getTime() && d <= weekEnd.getTime();
  }).length;

  const totalMins = open.reduce((n, t) => n + expectedRemainingMins(t, pace[t.subject]), 0);
  const workload = analyseWorkload(tasks, { now, profile, paceBySubject: pace });

  return {
    scope: "workload-summary",
    openCount: open.length,
    overdueCount,
    dueThisWeek,
    estimatedHours: Math.round((totalMins / 60) * 2) / 2,
    // The existing headline is already workload-only language with no titles in it.
    headline: workload.headline,
  };
}

export type DeadlineView = {
  scope: "upcoming-deadlines";
  items: Array<{
    /** Subject only. The task's own title is never included. */
    subject: string;
    dueAt: string;
    done: boolean;
  }>;
};

export async function upcomingDeadlinesFor(
  viewerUserId: string,
  grantId: string,
  now = new Date()
): Promise<DeadlineView> {
  const subjectUserId = await requireScope(viewerUserId, grantId, "upcoming-deadlines");

  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const items = (await listHomework(subjectUserId))
    .filter((h) => {
      if (!h.dueAt) return false;
      const d = new Date(h.dueAt).getTime();
      return d >= now.getTime() - 2 * 86_400_000 && d <= horizon.getTime();
    })
    .map((h) => ({
      subject: h.subject?.name ?? "General",
      dueAt: h.dueAt!,
      done: h.status === "done",
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return { scope: "upcoming-deadlines", items };
}

export type ProgressView = {
  scope: "progress-stats";
  onTimeRate: number;
  totalSessions: number;
  /** Weekly completion counts. No task identities. */
  weeks: Array<{ label: string; completed: number; onTime: number }>;
  trend: number | null;
};

export async function progressStatsFor(viewerUserId: string, grantId: string): Promise<ProgressView> {
  const subjectUserId = await requireScope(viewerUserId, grantId, "progress-stats");
  const analytics = await buildAnalytics(subjectUserId);

  return {
    scope: "progress-stats",
    onTimeRate: analytics.onTimeRate,
    totalSessions: analytics.totalSessions,
    // Minutes studied are deliberately dropped: how long a student works is
    // effort, and reporting it upward turns a planning tool into a timesheet.
    weeks: analytics.weeks.map((w) => ({
      label: w.label,
      completed: w.completed,
      onTime: w.onTime,
    })),
    trend: analytics.onTimeTrend,
  };
}

/** Display name for a grant's subject, so a viewer sees who shared with them. */
export async function subjectDisplayName(subjectUserId: string): Promise<string> {
  const row = (await db
    .prepare(`SELECT name, email FROM users WHERE id = ?`)
    .get(subjectUserId)) as { name: string | null; email: string | null } | undefined;

  if (!row) return "Someone";
  return row.name?.trim() || row.email?.split("@")[0] || "Someone";
}

/** Build every view a grant permits, in one call. */
export async function viewsForGrant(
  viewerUserId: string,
  grantId: string,
  scopes: ShareScope[],
  now = new Date()
) {
  const out: Record<string, unknown> = {};

  // Each is attempted independently: a scope that isn't granted simply doesn't
  // appear, rather than failing the whole request.
  if (scopes.includes("workload-summary")) {
    out.workload = await workloadSummaryFor(viewerUserId, grantId, now);
  }
  if (scopes.includes("upcoming-deadlines")) {
    out.deadlines = await upcomingDeadlinesFor(viewerUserId, grantId, now);
  }
  if (scopes.includes("progress-stats")) {
    out.progress = await progressStatsFor(viewerUserId, grantId);
  }

  return out;
}
