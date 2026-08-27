"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import TimetableImport from "./TimetableImport";
import ClassList, { type ClassSlot } from "./ClassList";

/**
 * The student's recurring class schedule — moved out of Settings into its
 * own page because a timetable is something you check often (what's my next
 * class, did that import work), not a setting you configure once and forget.
 */
export default function TimetablePanel() {
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await fetchJson<{ classes: ClassSlot[] }>("/api/timetable");
    if (data) setClasses(data.classes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="card animate-riseIn p-6">
      <h3 className="text-sm font-semibold text-white">Class timetable</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Recurring classes, so the coach knows when you&apos;re in lessons rather than free to study.
      </p>

      {!loading && <ClassList classes={classes} onChanged={load} />}

      {/* Import is the only way in now — a manual "add one class" form was
          removed as redundant next to a whole-timetable import, and a wrong
          row can already be fixed in place above rather than re-added. */}
      <TimetableImport onImported={load} />
    </section>
  );
}
