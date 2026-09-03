import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { administeredOrganizations, countPeople, listPeople } from "@/domains/identity";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  INSTITUTION_ADMIN: "Admin",
  DEPARTMENT_ADMIN: "Dept admin",
  TEACHER: "Teacher",
  TEACHING_ASSISTANT: "Assistant",
  STUDENT: "Student",
  PARENT: "Guardian",
  COUNSELOR: "Counsellor",
};

export default async function PeoplePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = (await administeredOrganizations(session.user.id))[0]!;
  // The institution's total is a count rather than the length of a page, now
  // that a page is not everyone.
  const [page, total] = await Promise.all([
    listPeople(org.id),
    countPeople(org.id),
  ]);
  const people = page.items;

  return (
    <div>
      <PageHeading
        title="People"
        subtitle={`${total} ${total === 1 ? "person" : "people"} in ${org.name}.`}
      />

      {people.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nobody here yet</p>
          <p className="mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-slate-400">
            People are linked from the command line for now. They must already have a
            Scholar account — the script connects existing people to the institution
            rather than creating accounts for them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.map((p, i) => (
            <Reveal key={p.userId} y={6} delay={Math.min(i * 0.03, 0.18)}>
              <div className="card flex items-center gap-3.5 rounded-xl px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[11.5px] text-slate-400">
                  {(p.name ?? p.email ?? "?").slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-slate-100">
                    {p.name ?? p.email ?? p.userId}
                  </p>
                  {p.name && p.email && (
                    <p className="truncate text-[11.5px] text-slate-500">{p.email}</p>
                  )}
                </div>

                {/* Every role they hold, because someone who teaches and
                    studies is one person with two jobs, not two rows. */}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {p.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400"
                    >
                      {ROLE_LABEL[r] ?? r}
                    </span>
                  ))}
                  {p.status !== "active" && (
                    <span className="rounded-full bg-amber-400/[0.12] px-2 py-0.5 text-[11px] text-amber-300">
                      Suspended
                    </span>
                  )}
                </div>
              </div>
            </Reveal>
          ))}

          {/* Said plainly rather than left as a silently truncated list: an
              administrator who cannot find someone should know why. */}
          {page.hasMore && (
            <p className="pt-1 text-[12.5px] text-slate-500">
              Showing the first {people.length} of {total}, by email address.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
