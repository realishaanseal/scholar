import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { administeredOrganizations, organizationSummary } from "@/domains/identity";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await administeredOrganizations(session.user.id);
  const org = orgs[0]!;
  const summary = await organizationSummary(org.id);

  return (
    <div>
      <PageHeading title={org.name} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="Students" value={summary.students} href="/admin/people" />
        <Stat label="Teachers" value={summary.teachers} href="/admin/people" />
        <Stat label="Courses" value={summary.courses} href="/admin/courses" />
        <Stat label="Sections" value={summary.sections} href="/admin/courses" />
        <Stat label="Published work" value={summary.publishedAssignments} />
        {/* The only figure that is a call to action, so the only one with
            colour — a backlog is a thing to do, not a thing to know. */}
        <Stat label="Awaiting marking" value={summary.awaitingMarking} href="/admin/health" accent={summary.awaitingMarking > 0} />
      </div>

      {summary.students === 0 && (
        <div className="card mt-4 rounded-xl px-4 py-3.5">
          <p className="text-[13.5px] text-slate-200">Nobody is enrolled yet</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">
            Create a course, then add people to it.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Link href="/admin/courses" className="btn btn-ghost px-3 py-1.5 text-[12.5px]">
              Create a course
            </Link>
            <Link href="/admin/people" className="btn btn-ghost px-3 py-1.5 text-[12.5px]">
              Add people
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, href, accent = false,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <div className="card h-full rounded-xl px-4 py-3.5">
      <p
        className={
          accent
            ? "text-2xl font-semibold tabular-nums text-[hsl(var(--accent-h)_var(--accent-s)_calc(var(--accent-l)_+_10%))]"
            : "text-2xl font-semibold tabular-nums text-slate-100"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-[12px] text-slate-500">{label}</p>
    </div>
  );
  return <Reveal y={8}>{href ? <Link href={href} className="block">{body}</Link> : body}</Reveal>;
}
