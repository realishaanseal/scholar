import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import {
  administeredOrganizations, countPeople, listPeople, pendingInvitations,
} from "@/domains/identity";
import { listCourses, listSections } from "@/domains/courses";
import PeopleInviter from "@/components/admin/PeopleInviter";

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
  const [page, total, pending, courses] = await Promise.all([
    listPeople(org.id),
    countPeople(org.id),
    pendingInvitations(org.id),
    listCourses(org.id),
  ]);
  const people = page.items;

  // Classes an invitee can be dropped straight into, so inviting a cohort and
  // building its roster are one action rather than two.
  const sectionLists = await Promise.all(courses.map((c) => listSections(c.id)));
  const sections = courses.flatMap((c, i) =>
    sectionLists[i].map((sec) => ({ id: sec.id, label: `${c.code} · ${sec.name}` }))
  );

  return (
    <div>
      <PageHeading
        title="People"
        subtitle={`${total} ${total === 1 ? "person" : "people"} in ${org.name}.`}
      />

      <PeopleInviter sections={sections} />

      {/* Invited and not yet arrived. Shown so an administrator can tell the
          difference between somebody who has not registered and an address
          that was typed wrong. */}
      {pending.length > 0 && (
        <div className="card mb-5 rounded-xl px-4 py-3.5">
          <p className="text-[12.5px] font-medium text-slate-200">
            {pending.length} invited, waiting to register
          </p>
          <ul className="mt-2 space-y-1">
            {pending.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 text-[12.5px] text-slate-400">
                <span className="font-mono">{p.email}</span>
                <span className="text-[11.5px] text-slate-600">{p.role.toLowerCase().replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-600">
            They join automatically when they sign up with that address.
          </p>
        </div>
      )}

      {people.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nobody here yet</p>
          <p className="mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-slate-400">
            Add them above.
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
