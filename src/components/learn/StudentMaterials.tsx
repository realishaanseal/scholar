"use client";

import { Reveal } from "@/components/motion";
import type { CourseMaterial } from "@/domains/library";

type Material = CourseMaterial & { downloadUrl: string | null };

/**
 * The course library, as a student reads it.
 *
 * Read-only by construction rather than by hiding buttons: there is no
 * publish toggle and no delete here, so nothing has to remember to check who
 * is looking. Only published materials ever reach this component.
 */
export default function StudentMaterials({ materials }: { materials: Material[] }) {
  if (materials.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-200">Nothing shared yet</p>
        <p className="mt-1.5 max-w-[40ch] text-[13px] leading-relaxed text-slate-400">
          Textbooks, readings and slides your teacher shares will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {materials.map((m, i) => {
        const href = m.downloadUrl ?? m.url ?? "#";
        const external = !m.downloadUrl && Boolean(m.url);
        return (
          <Reveal key={m.id} y={6} delay={Math.min(i * 0.03, 0.15)}>
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              className="card card-hover flex items-center gap-3.5 rounded-xl px-4 py-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[10px] uppercase tracking-wide text-slate-400">
                {m.kind === "link" ? "URL" : (m.filename?.split(".").pop() ?? "doc").slice(0, 4)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-slate-100">{m.title}</p>
                {m.description ? (
                  <p className="truncate text-[11.5px] text-slate-500">{m.description}</p>
                ) : (
                  m.sizeBytes !== null && (
                    <p className="text-[11.5px] text-slate-500">{formatSize(m.sizeBytes)}</p>
                  )
                )}
              </div>

              <span className="shrink-0 text-[11.5px] text-slate-500">
                {external ? "Open ↗" : "Download"}
              </span>
            </a>
          </Reveal>
        );
      })}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
