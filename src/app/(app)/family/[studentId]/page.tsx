import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import ChildDigest from "@/components/family/ChildDigest";
import { auth } from "@/lib/auth";
import { wardsOf } from "@/domains/guardians";

export const dynamic = "force-dynamic";

/** How far back the summary reaches. A term is too long to read; a week is too short. */
const WINDOW_DAYS = 28;

/**
 * One child's summary.
 *
 * The student id is in the URL, so the first thing this does is check it
 * against the links this session actually holds. A guardian who edits the
 * address bar gets a 404, not somebody else's child — the id names which of
 * *their* children to show and never widens what they may see.
 */
export default async function ChildPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { studentId } = await params;
  const ward = (await wardsOf(session.user.id)).find((w) => w.studentUserId === studentId);
  if (!ward) notFound();

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div>
      <Link
        href="/family"
        className="mb-4 inline-block text-[11.5px] text-slate-500 hover:text-slate-300"
      >
        ← My children
      </Link>

      <PageHeading
        title={ward.studentName ?? "Student"}
        subtitle={`${ward.organizationName} · last ${WINDOW_DAYS} days`}
      />

      <ChildDigest
        studentId={studentId}
        organizationId={ward.organizationId}
        from={iso(from)}
        to={iso(to)}
      />

      <p className="mt-5 max-w-[80ch] text-[11.5px] leading-relaxed text-slate-500">
        The school decides what appears here. Marks are shown once a teacher releases
        them, and {ward.studentName ?? "your child"} can see that you are linked to their account.
      </p>
    </div>
  );
}
