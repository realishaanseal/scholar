export type Urgency = "overdue" | "today" | "tomorrow" | "soon" | "later" | "none";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysUntil(due: Date, now = new Date()): number {
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY);
}

export function urgencyOf(dueAt: string | Date | null, now = new Date()): Urgency {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  if (due.getTime() < now.getTime()) return "overdue";

  const d = daysUntil(due, now);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 3) return "soon";
  return "later";
}

export const URGENCY_STYLES: Record<Urgency, { ring: string; text: string; bg: string; label: string }> = {
  overdue:  { ring: "border-red-500/30",    text: "text-red-300",    bg: "bg-red-500/[0.12]",    label: "Overdue" },
  today:    { ring: "border-orange-500/30", text: "text-orange-300", bg: "bg-orange-500/[0.12]", label: "Due today" },
  tomorrow: { ring: "border-amber-500/25",  text: "text-amber-300",  bg: "bg-amber-500/[0.10]",  label: "Due tomorrow" },
  soon:     { ring: "border-yellow-500/20", text: "text-yellow-200", bg: "bg-yellow-500/[0.08]", label: "Due soon" },
  later:    { ring: "border-white/[0.08]",  text: "text-slate-400",  bg: "bg-white/[0.035]",     label: "Scheduled" },
  none:     { ring: "border-white/[0.08]",  text: "text-slate-500",  bg: "bg-white/[0.035]",     label: "No deadline" },
};

export function formatDue(dueAt: string | Date | null, now = new Date()): string {
  if (!dueAt) return "No deadline";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No deadline";

  const d = daysUntil(due, now);
  const time = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (due.getTime() < now.getTime()) {
    const overdueDays = Math.abs(d);
    if (overdueDays === 0) return `Was due ${time} today`;
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }
  if (d === 0) return `Today, ${time}`;
  if (d === 1) return `Tomorrow, ${time}`;
  if (d <= 6) return `${due.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  return due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: due.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-500/[0.13] text-red-300 border border-red-500/25",
  normal: "bg-white/[0.05] text-slate-300 border border-white/10",
  low:    "bg-white/[0.03] text-slate-500 border border-white/[0.07]",
};
