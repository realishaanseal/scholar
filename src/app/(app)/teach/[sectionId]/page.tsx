import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SectionWorkbench from "@/components/teach/SectionWorkbench";
import { auth } from "@/lib/auth";
import { can } from "@/lib/authz";
import { resolveActor } from "@/domains/identity";
import { getSectionDetail } from "@/domains/courses";
import { listAssignments, scopeOfSection } from "@/domains/assessment";

export const dynamic = "force-dynamic";

/**
 * One section, from the teacher's side.
 *
 * The authorization here is the same shape as the API guard's, and for the
 * same reason: a page is a data-fetching surface too, and rendering a server
 * component that reads the database is exactly as sensitive as a route
 * handler. The scope comes from the section row rather than the URL, so
 * pointing this page at another institution's section id resolves to *their*
 * organization and fails the check.
 *
 * A refusal renders notFound() rather than a "forbidden" page, matching the
 * API: distinguishing the two tells a stranger which section ids are real.
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

  const [section, assignments] = await Promise.all([
    getSectionDetail(sectionId),
    listAssignments(sectionId),
  ]);
  if (!section) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/teach"
          className="text-[12.5px] text-slate-500 transition-colors hover:text-slate-300"
        >
          ← Teaching
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          <span className="gradient-text">
            {section.courseCode} · {section.name}
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          {section.courseTitle} — {section.termName} · {section.organizationName}
        </p>
      </div>

      <SectionWorkbench
        sectionId={sectionId}
        initialAssignments={assignments}
        enrolledCount={section.enrolledCount}
      />
    </div>
  );
}
