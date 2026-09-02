import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import MarkingQueue from "@/components/teach/MarkingQueue";
import { auth } from "@/lib/auth";
import { listPendingMarking } from "@/domains/assessment";

export const dynamic = "force-dynamic";

/**
 * The marking backlog, across every class.
 *
 * No permission check is needed to build this list: the query is joined
 * through section_teachers on the viewer's own id, so it can only ever return
 * submissions from sections they teach. Grading each one still goes through
 * the API, which authorizes properly.
 */
export default async function MarkingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const pending = await listPendingMarking(session.user.id);

  return (
    <div>
      <PageHeading
        title="Marking"
        subtitle={
          pending.length === 0
            ? "Nothing is waiting on you."
            : `${pending.length} submission${pending.length === 1 ? "" : "s"} waiting, oldest first.`
        }
      />
      <MarkingQueue initial={pending} />
    </div>
  );
}
