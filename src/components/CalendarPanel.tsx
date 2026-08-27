"use client";

import GoogleCalendarPanel from "./GoogleCalendarPanel";

/** Exporting/syncing deadlines to an external calendar — its own page for the
 *  same reason as Timetable: a sync status is something you check in on, not
 *  a one-time setting. */
export default function CalendarPanel() {
  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Calendar</h3>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-slate-200">Calendar file (.ics)</span>
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                Available
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
              Download your deadlines and classes, then import into Google Calendar, Outlook or
              Apple Calendar.
            </p>
          </div>
          <a href="/api/calendar/export" className="btn-primary shrink-0 px-4 py-2 text-xs" download>
            Download .ics
          </a>
        </div>
      </div>

      <GoogleCalendarPanel />

      {/* Stated as pending rather than shipped as a button that does nothing. */}
      <div className="mt-2.5 rounded-xl border border-white/[0.05] bg-white/[0.012] p-4 opacity-70">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-slate-400">Outlook Calendar</span>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Not yet connected
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
          Two-way sync needs a registered Microsoft application.
        </p>
      </div>
    </section>
  );
}
