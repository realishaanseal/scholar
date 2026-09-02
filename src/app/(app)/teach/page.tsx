import Link from "next/link";
import { redirect } from "next/navigation";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { listSectionsForTeacher, teacherInbox } from "@/domains/courses";

export const dynamic = "force-dynamic";

/**
 * The teacher's landing page.
 *
 * This used to lead with the institution's structure — organization name,
 * term, department — on every row. A teacher already knows which school they
 * work at, and repeating it is noise dressed as information. What they cannot
 * see at a glance is what needs them today, so that leads instead and the
 * institutional framing is gone: a class is its code and its section, and the
 * term appears once if at all.
 *
 * No permission check is needed to list. The query is keyed on the viewer's
 * own teaching assignments, so it can only ever return their own classes.
 * A check that adds nothing is worse than none — it implies a gate that is not
 * the one protecting the data.
 */
export default async function TeachPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [sections, inbox] = await Promise.all([
    listSectionsForTeacher(session.user.id),
    teacherInbox(session.user.id),
  ]);

  const firstName = (session.user.name ?? "").split(" ")[0];

  if (sections.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Teaching</span>
        </h1>
        <div className="card mt-6 grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">
            You are not teaching any classes
          </p>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-slate-400">
            Classes appear here once you are added to one. Your own homework,
            timetable and planning are unaffected either way — they stay yours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">
            {firstName ? `Afternoon, ${firstName}` : "Teaching"}
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">{summarise(inbox)}</p>
      </div>

      {/* What needs you, before what you have. */}
      {(inbox.ungraded > 0 || inbox.draftsWaiting > 0 || inbox.nextDeadline) && (
        <Reveal y={8}>
          <div className="mb-6 grid gap-2.5 sm:grid-cols-3">
            <Card
              value={String(inbox.ungraded)}
              label="waiting to be marked"
              urgent={inbox.ungraded > 0}
            />
            <Card value={String(inbox.dueThisWeek)} label="due in the next week" />
            <Card
              value={inbox.nextDeadline ? relative(inbox.nextDeadline.dueAt) : "—"}
              label={
                inbox.nextDeadline
                  ? `${inbox.nextDeadline.courseCode} · ${inbox.nextDeadline.title}`
                  : "nothing scheduled"
              }
            />
          </div>
        </Reveal>
      )}

      <h2 className="mb-2.5 text-[13px] font-semibold tracking-tight text-slate-300">
        Your classes
      </h2>

      <div className="space-y-2.5">
        {sections.map((s, i) => (
          <Reveal key={s.id} y={10} delay={Math.min(i * 0.04, 0.2)}>
            <Link
              href={`/teach/${s.id}`}
              className="card card-hover flex items-center gap-4 rounded-xl px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-slate-100">
                  {s.courseCode} · {s.name}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-slate-500">
                  {s.courseTitle}
                  {s.enrolledCount > 0 && ` · ${s.enrolledCount} students`}
                </p>
              </div>

              {/* Only the number that is a call to action gets weight. */}
              {s.ungradedSubmissions > 0 ? (
                <span className="shrink-0 rounded-full bg-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_-_18%))]/30 px-2.5 py-1 text-[11.5px] font-medium text-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_+_16%))]">
                  {s.ungradedSubmissions} to mark
                </span>
              ) : (
                <span className="shrink-0 text-[11.5px] text-slate-600">
                  {s.openAssignments} published
                </span>
              )}
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

/** One sentence about the state of things, rather than a row of raw counts. */
function summarise(inbox: {
  ungraded: number;
  draftsWaiting: number;
  nextDeadline: { dueAt: string } | null;
}): string {
  if (inbox.ungraded > 0) {
    return `${inbox.ungraded} piece${inbox.ungraded === 1 ? "" : "s"} of work waiting on you.`;
  }
  if (inbox.draftsWaiting > 0) {
    return `Nothing to mark. ${inbox.draftsWaiting} draft${
      inbox.draftsWaiting === 1 ? "" : "s"
    } not published yet.`;
  }
  if (inbox.nextDeadline) return "Nothing to mark. Everything is published.";
  return "Nothing waiting on you.";
}

function Card({
  value, label, urgent = false,
}: {
  value: string;
  label: string;
  urgent?: boolean;
}) {
  return (
    <div className="card rounded-xl px-4 py-3.5">
      <p
        className={
          urgent
            ? "text-[22px] font-semibold tabular-nums tracking-tight text-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_+_14%))]"
            : "text-[22px] font-semibold tabular-nums tracking-tight text-slate-200"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-slate-500">{label}</p>
    </div>
  );
}

/** "in 3 days" reads faster than a date when the question is how much time is left. */
function relative(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `${days} days`;
}
