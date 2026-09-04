import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeading from "@/components/PageHeading";
import { Reveal } from "@/components/motion";
import { auth } from "@/lib/auth";
import { materialsForStudent } from "@/domains/library";
import { enrolledOrganizations } from "@/domains/learning";

export const dynamic = "force-dynamic";

/**
 * Everything a student has been given.
 *
 * Materials lived inside a per-course tab, which meant finding the physics
 * ebook required first remembering which course it was under. A library is a
 * place you browse, and browsing one shelf at a time with the shelves in
 * separate rooms is not browsing.
 *
 * Ordered by what is actually due rather than alphabetically or by course.
 * Scholar is the only system here that knows which of a student's work is
 * imminent, so on Wednesday the reading for Friday's essay belongs at the
 * top. That ordering is the whole reason this is worth being its own page
 * rather than a list of links to five other pages.
 */
export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await enrolledOrganizations(session.user.id);
  const materials = (
    await Promise.all(orgs.map((o) => materialsForStudent(session.user!.id!, o)))
  ).flat();

  // Grouped by course, but the courses themselves are ordered by urgency —
  // which is what the query already did.
  const byCourse = new Map<string, typeof materials>();
  for (const m of materials) {
    if (!byCourse.has(m.courseCode)) byCourse.set(m.courseCode, []);
    byCourse.get(m.courseCode)!.push(m);
  }

  return (
    <div>
      <PageHeading
        title="Library"
        subtitle={
          materials.length === 0
            ? "Everything your teachers give you will collect here."
            : `${materials.length} ${materials.length === 1 ? "item" : "items"} across ${byCourse.size} ${byCourse.size === 1 ? "course" : "courses"}.`
        }
      />

      {materials.length === 0 ? (
        <div className="card grid place-items-center rounded-xl px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-slate-200">Nothing here yet</p>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Material your teachers publish appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byCourse.entries()].map(([code, items], gi) => {
            const soonest = items[0]?.hoursUntilDue ?? null;
            return (
              <section key={code}>
                <div className="mb-2 flex flex-wrap items-baseline gap-2.5">
                  <h2 className="font-mono text-[12.5px] text-slate-300">{code}</h2>
                  <span className="text-[12px] text-slate-500">{items[0]?.courseTitle}</span>
                  {/* Why this shelf is where it is. Said rather than implied,
                      because an order nobody understands reads as random. */}
                  {soonest !== null && soonest < 168 && (
                    <span className="rounded-full bg-amber-400/[0.12] px-2 py-0.5 text-[11px] text-amber-300">
                      {soonest < 24
                        ? "work due today"
                        : `work due in ${Math.round(soonest / 24)} days`}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {items.map((m, i) => (
                    <Reveal key={m.id} y={6} delay={Math.min((gi + i) * 0.02, 0.16)}>
                      <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3">
                        <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] capitalize text-slate-400">
                          {m.kind}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-slate-100">
                          {m.title}
                        </span>
                        {m.fileId ? (
                          <a
                            href={`/api/institution/files/${m.fileId}`}
                            className="text-[12.5px] text-vx-300 hover:text-vx-200"
                          >
                            Open
                          </a>
                        ) : m.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-[12.5px] text-vx-300 hover:text-vx-200"
                          >
                            Open ↗
                          </a>
                        ) : null}
                        <Link
                          href={`/learn/${m.sectionId}`}
                          className="text-[12px] text-slate-500 hover:text-slate-300"
                        >
                          Course
                        </Link>
                        {m.description && (
                          <p className="w-full text-[12.5px] leading-relaxed text-slate-400">
                            {m.description}
                          </p>
                        )}
                      </div>
                    </Reveal>
                  ))}
                </div>
              </section>
            );
          })}

        </div>
      )}
    </div>
  );
}
