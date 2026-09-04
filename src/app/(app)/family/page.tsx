import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { auth } from "@/lib/auth";
import { wardsOf } from "@/domains/guardians";

export const dynamic = "force-dynamic";

/**
 * A guardian's landing page.
 *
 * Scoped by the session rather than by anything in the URL: the children are
 * whoever the school has linked to this account, and there is no parameter a
 * caller could supply to widen that.
 */
export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const wards = await wardsOf(session.user.id);

  return (
    <div>
      <PageHeading
        title="My children"
        subtitle={
          wards.length === 0
            ? undefined
            : `${wards.length} ${wards.length === 1 ? "child" : "children"}`
        }
      />

      {wards.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-slate-200">No children linked</p>
          <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate-400">
            A school links a guardian to a student. Ask whoever administers Scholar there
            if you expected to see someone here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {wards.map((w) => (
            <Link
              key={w.studentUserId}
              href={`/family/${w.studentUserId}`}
              className="card flex items-center gap-4 rounded-xl px-4 py-3.5 transition-colors hover:border-white/[0.16]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[13px] font-medium text-slate-300">
                {(w.studentName ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-slate-100">
                  {w.studentName ?? "Unnamed student"}
                </span>
                <span className="block text-[12px] text-slate-500">
                  {w.organizationName}
                  {w.relationship ? ` · ${w.relationship}` : ""}
                </span>
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-slate-600">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
