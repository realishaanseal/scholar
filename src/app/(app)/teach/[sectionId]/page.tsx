import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MaterialsPanel from "@/components/teach/MaterialsPanel";
import SectionTabs from "@/components/teach/SectionTabs";
import SectionWorkbench from "@/components/teach/SectionWorkbench";
import Gradebook from "@/components/teach/Gradebook";
import { auth } from "@/lib/auth";
import { can } from "@/lib/authz";
import { resolveActor } from "@/domains/identity";
import { getSectionDetail, listRoster } from "@/domains/courses";
import { listAssignments, scopeOfSection } from "@/domains/assessment";
import { listMaterials } from "@/domains/library";
import { sectionGradebook } from "@/domains/grading";

export const dynamic = "force-dynamic";

/**
 * One class, from the teacher's side.
 *
 * Authorized the same way the API is, and for the same reason: a server
 * component that reads the database is as sensitive as a route handler. The
 * scope comes from the section row rather than the URL, so pointing this at
 * another institution's section id resolves to *their* organization and fails.
 *
 * A refusal renders notFound() rather than a forbidden page, matching the API
 * — distinguishing the two tells a stranger which section ids are real.
 */
export default async function TeachSectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const scope = await scopeOfSection(sectionId);
  if (!scope) notFound();

  const actor = await resolveActor(session.user.id);
  if (!can(actor, "assignment:create", scope)) notFound();

  const [section, assignments, roster, materials, gradebook] = await Promise.all([
    getSectionDetail(sectionId),
    listAssignments(sectionId),
    listRoster(sectionId),
    listMaterials(scope.courseId),
    sectionGradebook(sectionId, scope.courseId),
  ]);
  if (!section) notFound();

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/teach"
          className="text-[12.5px] text-slate-500 transition-colors hover:text-slate-300"
        >
          ← Your classes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          <span className="gradient-text">
            {section.courseCode} · {section.name}
          </span>
        </h1>
        {/* The course title, and nothing institutional. A teacher knows where
            they work; the term is only worth saying when it disambiguates. */}
        <p className="mt-1.5 text-sm text-slate-400">{section.courseTitle}</p>
      </div>

      <SectionTabs
        counts={{ work: assignments.length, materials: materials.length, students: roster.length }}
        work={
          <SectionWorkbench
            sectionId={sectionId}
            timezone={section.timezone}
            courseId={scope.courseId}
            initialAssignments={assignments}
            enrolledCount={section.enrolledCount}
          />
        }
        materials={
          <MaterialsPanel
            courseId={scope.courseId}
            initial={materials.map((m) => ({
              ...m,
              downloadUrl: m.fileId ? `/api/institution/files/${m.fileId}` : null,
            }))}
          />
        }
        students={<Roster roster={roster} />}
        grades={<Gradebook data={gradebook} />}
      />
    </div>
  );
}

/**
 * The roster.
 *
 * Deliberately identifiers only for now. Showing names and email addresses
 * here would be the first place this application copies a student's personal
 * details into a teacher-facing surface, and that deserves to be a decision
 * made on purpose rather than a side effect of building a list.
 */
function Roster({ roster }: { roster: { id: string; userId: string; enrolledAt: string }[] }) {
  if (roster.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-12 text-center">
        <p className="text-[14px] font-medium text-slate-200">Nobody is enrolled yet</p>
        <p className="mt-1.5 max-w-[44ch] text-[13px] leading-relaxed text-slate-400">
          Work you publish will reach no one until students are added to this class.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {roster.map((r) => (
        <div key={r.id} className="card flex items-center gap-3 rounded-xl px-4 py-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[11px] text-slate-400">
            {r.userId.slice(0, 2).toUpperCase()}
          </span>
          <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-400">
            {r.userId}
          </p>
          <span className="shrink-0 text-[11.5px] text-slate-500">
            since {new Date(r.enrolledAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
