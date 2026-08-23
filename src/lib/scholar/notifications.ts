import { db, nowISO } from "../db";
import type { RiskSignal, SignalKind } from "./detect";

/**
 * Notification preferences and dismissal.
 *
 * The engine never invents its own alerts — every notification is a risk signal
 * that already passed detection's evidence thresholds. This layer only decides
 * which of them the student still wants to see.
 */

export type NotifyPrefs = Record<SignalKind, boolean>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  "insufficient-time": true,
  "deadline-cluster": true,
  "overdue-pileup": true,
  "exam-approaching": true,
  // Behavioural observations are useful but not urgent, and they repeat.
  // Off by default so the first thing a student sees is actionable, not a critique.
  "chronic-underestimation": false,
  "repeated-lateness": false,
  "long-untouched": false,
};

export const SIGNAL_LABELS: Record<SignalKind, { label: string; hint: string }> = {
  "insufficient-time": {
    label: "Not enough time",
    hint: "A task needs more time than remains before its deadline",
  },
  "deadline-cluster": {
    label: "Overloaded days",
    hint: "Several deadlines land on the same day",
  },
  "overdue-pileup": {
    label: "Overdue building up",
    hint: "Three or more tasks are past their deadline",
  },
  "exam-approaching": {
    label: "Exam with little prep",
    hint: "An exam is close and nothing is scheduled for it",
  },
  "chronic-underestimation": {
    label: "Estimates running over",
    hint: "A subject consistently takes longer than planned",
  },
  "repeated-lateness": {
    label: "Finishing late",
    hint: "A recent pattern of missing deadlines",
  },
  "long-untouched": {
    label: "Untouched work",
    hint: "A task has sat unopened for a long time",
  },
};

export async function getNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const row = (await db
    .prepare(`SELECT notifyPrefs FROM academic_profile WHERE userId = ?`)
    .get(userId)) as { notifyPrefs: string | null } | undefined;

  if (!row?.notifyPrefs) return { ...DEFAULT_NOTIFY_PREFS };

  try {
    const stored = JSON.parse(row.notifyPrefs);
    // Merge over defaults so a signal kind added in a later version is enabled
    // per its default rather than silently missing from an older stored blob.
    return { ...DEFAULT_NOTIFY_PREFS, ...stored };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

export async function setNotifyPrefs(userId: string, patch: Partial<NotifyPrefs>): Promise<NotifyPrefs> {
  const next = { ...(await getNotifyPrefs(userId)), ...patch };

  await db.prepare(
    `INSERT INTO academic_profile (userId, notifyPrefs, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET notifyPrefs = excluded.notifyPrefs, updatedAt = excluded.updatedAt`
  ).run(userId, JSON.stringify(next), nowISO());

  return next;
}

export async function dismissedKeys(userId: string): Promise<Set<string>> {
  const rows = (await db
    .prepare(`SELECT signalKey FROM dismissed_signals WHERE userId = ?`)
    .all(userId)) as Array<{ signalKey: string }>;
  return new Set(rows.map((r) => r.signalKey));
}

export async function dismissSignal(userId: string, signalKey: string): Promise<void> {
  await db.prepare(
    `INSERT INTO dismissed_signals (userId, signalKey, dismissedAt) VALUES (?, ?, ?)
     ON CONFLICT(userId, signalKey) DO NOTHING`
  ).run(userId, signalKey, nowISO());
}

export async function clearDismissals(userId: string): Promise<number> {
  return (await db.prepare(`DELETE FROM dismissed_signals WHERE userId = ?`).run(userId)).changes;
}

/** Apply preferences and dismissals to freshly detected signals. */
export function filterSignals(
  signals: RiskSignal[],
  prefs: NotifyPrefs,
  dismissed: Set<string>
): RiskSignal[] {
  return signals.filter((s) => prefs[s.kind] !== false && !dismissed.has(s.key));
}
