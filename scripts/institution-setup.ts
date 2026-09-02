/**
 * Bootstrap an institution from the command line.
 *
 * There is a chicken-and-egg problem at the start of any multi-tenant system:
 * an admin console needs an admin, and nothing in the product can create the
 * first one. This script is that first step, and only that — once an
 * institution has an admin, everything else belongs in the app.
 *
 * It deliberately does NOT create user accounts. People sign up through the
 * normal flow; this only links accounts that already exist to an institution.
 * A provisioning script that could mint credentials would be a much larger
 * thing to leave lying in a repository.
 *
 * Safe to re-run: every step is get-or-create, so correcting a typo and
 * running it again converges rather than duplicating.
 *
 *   npm run institution:setup -- \
 *     --org "Springfield High" --slug springfield \
 *     --admin you@example.com \
 *     --course PHY101 --course-title "Physics I" --section A \
 *     --students alice@example.com,bob@example.com
 */
import { db, newId } from "../src/lib/db";
import {
  addMember, createAcademicYear, createOrganization, getOrganizationBySlug,
} from "../src/domains/identity";
import { assignTeacher, createCourse, createSection, enroll } from "../src/domains/courses";

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

const USAGE = `
Bootstrap an institution.

Required:
  --org           "Springfield High School"     Institution name
  --slug          springfield                   URL-safe identifier
  --admin         you@example.com               An existing Scholar account

Optional:
  --timezone      Asia/Kolkata                  Defaults to UTC
  --course        PHY101                        Creates a course
  --course-title  "Physics I"                   Defaults to the code
  --section       A                             Defaults to "A"
  --term          "Autumn 2026"                 Defaults to "Full year"
  --students      a@x.com,b@x.com               Enrols existing accounts

The admin becomes INSTITUTION_ADMIN, and also TEACHER of the section so the
Teaching tab appears for them immediately.
`;

async function findUser(email: string): Promise<{ id: string; email: string } | null> {
  const r = await db
    .prepare(`SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)`)
    .get(email.trim());
  return r ? { id: r.id, email: r.email } : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.\n");
    process.exit(1);
  }
  if (!args.org || !args.slug || !args.admin) {
    console.error(USAGE);
    process.exit(1);
  }

  // Everyone named must already have an account. Checked up front so the
  // script fails before writing anything rather than half way through.
  const adminUser = await findUser(args.admin);
  if (!adminUser) {
    console.error(
      `No Scholar account for ${args.admin}.\n` +
        `Sign up with that address first, then run this again.`
    );
    process.exit(1);
  }

  const studentEmails = (args.students ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const students: { id: string; email: string }[] = [];
  const missing: string[] = [];
  for (const email of studentEmails) {
    const u = await findUser(email);
    if (u) students.push(u);
    else missing.push(email);
  }
  if (missing.length) {
    console.error(
      `No Scholar account for: ${missing.join(", ")}\n` +
        `Have them sign up first, or drop them from --students.`
    );
    process.exit(1);
  }

  console.log("");

  /* 1. Organization */
  let org = await getOrganizationBySlug(args.slug);
  if (org) {
    console.log(`  organization   ${org.name}  (already existed)`);
  } else {
    org = await createOrganization({
      name: args.org,
      slug: args.slug,
      timezone: args.timezone ?? "UTC",
      locale: "en",
    });
    console.log(`  organization   ${org.name}  created`);
  }

  /* 2. Academic year and term — assignments hang off a term via the section. */
  const year = new Date().getFullYear();
  const existingYear = await db
    .prepare(
      `SELECT id, name FROM academic_years WHERE organization_id = ? AND is_current LIMIT 1`
    )
    .get(org.id);

  let academicYearId: string;
  if (existingYear) {
    academicYearId = existingYear.id;
    console.log(`  academic year  ${existingYear.name}  (already existed)`);
  } else {
    const created = await createAcademicYear(org.id, {
      name: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
      startsOn: `${year}-08-01`,
      endsOn: `${year + 1}-07-31`,
      isCurrent: true,
    });
    academicYearId = created.id;
    console.log(`  academic year  ${created.name}  created`);
  }

  const termName = args.term ?? "Full year";
  const existingTerm = await db
    .prepare(`SELECT id FROM terms WHERE academic_year_id = ? AND name = ?`)
    .get(academicYearId, termName);

  let termId: string;
  if (existingTerm) {
    termId = existingTerm.id;
    console.log(`  term           ${termName}  (already existed)`);
  } else {
    termId = newId();
    await db
      .prepare(
        `INSERT INTO terms (id, organization_id, academic_year_id, name, starts_on, ends_on)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(termId, org.id, academicYearId, termName, `${year}-08-01`, `${year + 1}-07-31`);
    console.log(`  term           ${termName}  created`);
  }

  /* 3. Membership. Admin, and teacher too, so Teaching appears for them. */
  await addMember(org.id, { userId: adminUser.id, role: "INSTITUTION_ADMIN", departmentId: null });
  await addMember(org.id, { userId: adminUser.id, role: "TEACHER", departmentId: null });
  console.log(`  admin          ${adminUser.email}  INSTITUTION_ADMIN + TEACHER`);

  /* 4. Course and section */
  if (!args.course) {
    console.log("\n  No --course given, so no section was created.");
    console.log("  The Teaching tab needs a section to point at.\n");
    await shutdown();
    return;
  }

  const code = args.course.trim().toUpperCase();
  const existingCourse = await db
    .prepare(`SELECT id, code FROM courses WHERE organization_id = ? AND code = ?`)
    .get(org.id, code);

  let courseId: string;
  if (existingCourse) {
    courseId = existingCourse.id;
    console.log(`  course         ${code}  (already existed)`);
  } else {
    const course = await createCourse(org.id, {
      code,
      title: args["course-title"] ?? code,
      description: "",
      departmentId: null,
      credits: null,
    });
    courseId = course.id;
    // Published, because a draft course is invisible and this is a bootstrap.
    await db.prepare(`UPDATE courses SET status = 'published' WHERE id = ?`).run(courseId);
    console.log(`  course         ${code} — ${course.title}  created`);
  }

  const sectionName = args.section ?? "A";
  const existingSection = await db
    .prepare(
      `SELECT id FROM course_sections WHERE course_id = ? AND term_id = ? AND name = ?`
    )
    .get(courseId, termId, sectionName);

  let sectionId: string;
  if (existingSection) {
    sectionId = existingSection.id;
    console.log(`  section        ${sectionName}  (already existed)`);
  } else {
    const section = await createSection(org.id, {
      courseId, termId, name: sectionName, capacity: null,
    });
    sectionId = section.id;
    console.log(`  section        ${sectionName}  created`);
  }

  /* 5. Teaching assignment — the row that makes authorization bite. */
  await assignTeacher(org.id, sectionId, adminUser.id, "TEACHER");
  console.log(`  teaching       ${adminUser.email} teaches ${code} · ${sectionName}`);

  /* 6. Students */
  for (const s of students) {
    await addMember(org.id, { userId: s.id, role: "STUDENT", departmentId: null });
    await enroll(org.id, sectionId, s.id);
    console.log(`  enrolled       ${s.email}`);
  }

  console.log(`
Done.

  Sign in as ${adminUser.email} and a "Teaching" tab will appear in the
  sidebar. Open ${code} · ${sectionName}, create an assignment, and publish it.
${
  students.length
    ? `  It will land on ${students.length} student dashboard${students.length === 1 ? "" : "s"} straight away.`
    : `  Nobody is enrolled yet, so publishing will warn you that it reached no one.
  Re-run with --students to enrol people.`
}
`);

  await shutdown();
}

async function shutdown() {
  // The pool keeps the process alive otherwise.
  const g = globalThis as unknown as { __scholarPool?: { end(): Promise<void> } };
  await g.__scholarPool?.end();
}

main().catch(async (err) => {
  console.error("\nSetup failed:", (err as Error).message);
  await shutdown();
  process.exitCode = 1;
});
