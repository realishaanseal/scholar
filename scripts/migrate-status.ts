/**
 * Report what the database actually looks like, and change nothing.
 *
 *   npm run migrate:status
 *
 * Strictly read-only — no DDL, no writes, not even the migration ledger is
 * created if it is missing. Safe to point at production, which is the whole
 * point: verifying that a migration landed should not require a throwaway
 * database or a leap of faith.
 */
import { Pool } from "pg";
import { MIGRATIONS } from "../src/lib/migrations";
import { requireDatabaseUrl } from "./loadEnv";

/** Tables each migration is responsible for, so absence is reported usefully. */
const EXPECTED: Record<string, string[]> = {
  "0001_baseline": ["users", "homework", "subjects", "sessions"],
  "0002_organizations": [
    "organizations", "organization_memberships", "departments",
    "academic_years", "terms", "programs",
  ],
  "0003_courses": [
    "courses", "course_sections", "section_teachers", "enrollments",
    "modules", "lessons",
  ],
  "0004_assignments": ["assignments", "assignment_submissions"],
  "0005_files": ["files", "file_bytes", "assignment_files", "course_materials"],
  "0006_account_intent": [],
  "0007_gradebook": ["grade_categories", "grade_events"],
  "0008_quizzes": ["questions", "quiz_questions", "quiz_responses"],
  "0009_ai_assistance": ["grade_drafts"],
  "0010_governance": ["audit_log", "rate_limits"],
  "0011_time": [],
  "0012_timestamps_expand": [],
  "0013_timestamps_dualwrite": [],
  "0014_grading_scheme": [],
  "0015_ai_policy": [],
  "0016_invitations": ["invitations"],
  "0017_rubrics": ["rubrics", "rubric_criteria", "rubric_levels", "rubric_marks"],
};

async function main() {
  const connectionString = requireDatabaseUrl();

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const ledgerExists = await pool
      .query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`)
      .then((r) => Boolean(r.rows[0]?.present));

    const applied = new Map<string, { at: string; adopted: boolean }>();
    if (ledgerExists) {
      const { rows } = await pool.query(
        `SELECT id, applied_at, adopted FROM schema_migrations ORDER BY id`
      );
      for (const r of rows) {
        applied.set(r.id, { at: new Date(r.applied_at).toISOString(), adopted: r.adopted });
      }
    }

    const { rows: tableRows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const present = new Set(tableRows.map((r: { table_name: string }) => r.table_name));

    console.log(ledgerExists ? "\nMigration ledger present.\n" : "\nNo migration ledger yet.\n");

    let pending = 0;
    let missingTables = 0;

    for (const m of MIGRATIONS) {
      const record = applied.get(m.id);
      const tables = EXPECTED[m.id] ?? [];
      const absent = tables.filter((t) => !present.has(t));

      const state = record
        ? record.adopted
          ? `adopted ${record.at}`
          : `applied ${record.at}`
        : "PENDING";
      if (!record) pending++;
      if (absent.length) missingTables += absent.length;

      console.log(`  ${m.id.padEnd(22)} ${state}`);
      console.log(
        `  ${" ".repeat(22)} ${tables.length - absent.length}/${tables.length} tables present` +
          (absent.length ? `  missing: ${absent.join(", ")}` : "")
      );
    }

    // The one column that is not a table, and the reason the task list can
    // filter cancelled coursework.
    const { rows: colRows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'homework' AND column_name = 'archived_at'`
    );
    console.log(
      `\n  homework.archived_at   ${colRows.length ? "present" : "MISSING"}`
    );

    // A useful sanity signal that costs one cheap count each.
    for (const t of ["organizations", "courses", "assignments"]) {
      if (!present.has(t)) continue;
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      console.log(`  ${t.padEnd(22)} ${rows[0].c} row(s)`);
    }

    console.log(
      pending === 0 && missingTables === 0
        ? "\nSchema is current.\n"
        : `\n${pending} migration(s) pending, ${missingTables} expected table(s) missing.` +
            "\nRun: npm run migrate\n"
    );
    if (pending || missingTables) process.exitCode = 1;
  } catch (err) {
    console.error("Could not read the schema:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
