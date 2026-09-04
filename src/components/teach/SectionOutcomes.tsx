import HowItWent from "@/components/teach/HowItWent";
import { markedAssignments } from "@/domains/insight/teaching";

/**
 * The "How it went" tab for a section.
 *
 * One block per recently marked assignment. Empty until a rubric has actually
 * been used, because everything here is computed from rubric marks and an
 * assignment scored as a bare total has no criteria to break down.
 */
export default async function SectionOutcomes({
  sectionId,
  organizationId,
}: {
  sectionId: string;
  organizationId: string;
}) {
  const marked = await markedAssignments(sectionId, organizationId);

  if (marked.length === 0) {
    return (
      <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-200">Nothing marked yet</p>
        <p className="mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-slate-400">
          Once work has been marked against a rubric, this shows which criteria the
          class found hardest.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {marked.map((a) => (
        <div key={a.id}>
          <p className="mt-4 text-[13px] font-medium text-slate-100">{a.title}</p>
          <HowItWent assignmentId={a.id} organizationId={organizationId} />
        </div>
      ))}
    </div>
  );
}
