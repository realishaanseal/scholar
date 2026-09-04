import { institutionalRoute, NotFound } from "@/lib/api/guard";
import { scopeOfSection, type ResourceScope } from "@/domains/assessment";
import { sectionGradebook } from "@/domains/grading";
import { displayGrade, scheme } from "@/domains/grading/schemes";
import { getOrganizationTime } from "@/domains/identity";
import { getSectionDetail } from "@/domains/courses";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/governance";

export const runtime = "nodejs";

type Params = { sectionId: string };

async function sectionScope({ params }: { params: Params }) {
  const scope = await scopeOfSection(params.sectionId);
  if (!scope) throw new NotFound();
  return scope;
}

/**
 * The gradebook, as a spreadsheet.
 *
 * Teachers live in spreadsheets and will not stop, and refusing to export is
 * a hostage situation rather than a principled stand about owning the data.
 *
 * Downloaded rather than rendered, and logged: this is a file containing every
 * student's marks leaving the building, which is exactly the kind of access a
 * safeguarding lead may later need accounted for.
 */
export const GET = institutionalRoute<Params, ResourceScope>(
  { permission: "grade:view", scope: sectionScope },
  async ({ params, userId, scope }) => {
    const [section, orgTime] = await Promise.all([
      getSectionDetail(params.sectionId),
      getOrganizationTime(scope.organizationId),
    ]);
    if (!section) throw new NotFound();

    const book = await sectionGradebook(params.sectionId, section.courseId);
    const s = scheme(orgTime.gradingScheme);

    const header = [
      "Student",
      "Email",
      ...book.columns.map((c) => (c.points === null ? c.title : `${c.title} (/${c.points})`)),
      "Total",
    ];

    const rows = book.rows.map((r) => [
      r.name ?? "",
      r.email ?? "",
      ...book.columns.map((c) => {
        const cell = r.cells[c.assignmentId];
        // Work this student was never set is blank rather than zero — the
        // same rule the on-screen gradebook follows, and the one that makes
        // the exported total add up.
        if (cell?.status === "not-set") return "";
        return cell?.score ?? "";
      }),
      displayGrade(r.grade.percentage, s)?.text ?? "",
    ]);

    await audit({
      organizationId: scope.organizationId,
      actorUserId: userId,
      action: "file:download",
      subjectType: "gradebook",
      subjectId: params.sectionId,
      detail: { students: book.rows.length, columns: book.columns.length },
    });

    const filename = `${section.courseCode}-${section.name}-grades.csv`.replace(/[^\w.-]/g, "_");

    return new Response(toCsv([header, ...rows]), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  }
);
