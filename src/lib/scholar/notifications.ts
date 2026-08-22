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

function academicProfileDoc(userId: string) {
  return db.collection("users").doc(userId).collection("settings").doc("academicProfile");
}
function dismissedSignalsCol(userId: string) {
  return db.collection("users").doc(userId).collection("dismissedSignals");
}

export async function getNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const snap = await academicProfileDoc(userId).get();
  const stored = snap.exists ? (snap.data() as { notifyPrefs?: Partial<NotifyPrefs> }).notifyPrefs : undefined;
  if (!stored) return { ...DEFAULT_NOTIFY_PREFS };

  // Merge over defaults so a signal kind added in a later version is enabled
  // per its default rather than silently missing from an older stored blob.
  return { ...DEFAULT_NOTIFY_PREFS, ...stored };
}

export async function setNotifyPrefs(userId: string, patch: Partial<NotifyPrefs>): Promise<NotifyPrefs> {
  const next = { ...(await getNotifyPrefs(userId)), ...patch };

  await academicProfileDoc(userId).set({ notifyPrefs: next, updatedAt: nowISO() }, { merge: true });

  return next;
}

/**
 * Signal keys are mostly `kind:id` pairs of UUIDs/dates, but a couple (e.g.
 * `underestimate:${subject}`) embed a free-text subject name that could
 * contain `/` — which Firestore doc ids can't. Encode so any key is safe to
 * use directly as a doc id, and decode on the way back out.
 */
function encodeKey(signalKey: string): string {
  return encodeURIComponent(signalKey);
}

export async function dismissedKeys(userId: string): Promise<Set<string>> {
  const snap = await dismissedSignalsCol(userId).get();
  return new Set(snap.docs.map((d) => decodeURIComponent(d.id)));
}

export async function dismissSignal(userId: string, signalKey: string): Promise<void> {
  await dismissedSignalsCol(userId).doc(encodeKey(signalKey)).set({ dismissedAt: nowISO() }, { merge: true });
}

export async function clearDismissals(userId: string): Promise<number> {
  const snap = await dismissedSignalsCol(userId).get();
  if (snap.empty) return 0;

  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  return snap.size;
}

/** Apply preferences and dismissals to freshly detected signals. */
export function filterSignals(
  signals: RiskSignal[],
  prefs: NotifyPrefs,
  dismissed: Set<string>
): RiskSignal[] {
  return signals.filter((s) => prefs[s.kind] !== false && !dismissed.has(s.key));
}
