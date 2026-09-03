/**
 * Prove the timestamp conversion did not change anything.
 *
 *   npm run timestamps:verify
 *
 * Read-only. Compares every converted column against the text it came from by
 * rendering the timestamptz value back into the exact format the text column
 * holds and checking the two are identical, row by row.
 *
 * This exists because "the cast looked fine" is not evidence. A deadline that
 * shifts by an hour produces a student marked late for work they handed in on
 * time, and no amount of fixing the bug afterwards gives them that back. The
 * release that swaps reads onto the new columns must not ship while this
 * reports a single mismatch.
 *
 * Exits non-zero if anything fails, so it can gate a deploy.
 */
import { Pool } from "pg";
import { requireDatabaseUrl } from "./loadEnv";

/** Each converted column, and the text column it must still agree with. */
const PAIRS: Array<{ table: string; text: string; tz: string }> = [
  { table: "homework", text: "dueAt", tz: "due_at_tz" },
  { table: "homework", text: "createdAt", tz: "created_at_tz" },
  { table: "homework", text: "updatedAt", tz: "updated_at_tz" },
  { table: "homework", text: "completedAt", tz: "completed_at_tz" },
  { table: "homework", text: "startedAt", tz: "started_at_tz" },
  { table: "task_events", text: "dueAt", tz: "due_at_tz" },
  { table: "task_events", text: "completedAt", tz: "completed_at_tz" },
  { table: "task_events", text: "createdAt", tz: "created_at_tz" },
  { table: "subjects", text: "createdAt", tz: "created_at_tz" },
  { table: "timetable", text: "createdAt", tz: "created_at_tz" },
  { table: "academic_profile", text: "updatedAt", tz: "updated_at_tz" },
  { table: "user_settings", text: "updatedAt", tz: "updated_at_tz" },
  { table: "dismissed_signals", text: "dismissedAt", tz: "dismissed_at_tz" },
  { table: "users", text: "createdAt", tz: "created_at_tz" },
  { table: "groups", text: "createdAt", tz: "created_at_tz" },
  { table: "group_members", text: "joinedAt", tz: "joined_at_tz" },
  { table: "group_tasks", text: "dueAt", tz: "due_at_tz" },
  { table: "group_tasks", text: "createdAt", tz: "created_at_tz" },
  { table: "group_comments", text: "createdAt", tz: "created_at_tz" },
  { table: "share_grants", text: "createdAt", tz: "created_at_tz" },
  { table: "share_grants", text: "expiresAt", tz: "expires_at_tz" },
  { table: "share_grants", text: "revokedAt", tz: "revoked_at_tz" },
];

/** The exact shape the text columns hold, so a round trip is byte-identical. */
const RENDER = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

async function main() {
  const connectionString = requireDatabaseUrl();
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 1,
  });

  let mismatches = 0;
  let missing = 0;
  let checked = 0;

  try {
    console.log("\nTimestamp conversion — comparing every converted value to its original.\n");

    for (const p of PAIRS) {
      // A column that is not there yet is reported rather than skipped
      // silently: the usual reason is that the migration has not run.
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
            AND column_name IN ($2, $3)`,
        [p.table, p.text, p.tz]
      );
      if (cols.length < 2) {
        console.log(`  ${(p.table + "." + p.text).padEnd(36)} MISSING (run npm run migrate)`);
        missing++;
        continue;
      }

      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT("${p.text}")::int AS text_set,
           COUNT("${p.tz}")::int AS tz_set,
           COUNT(*) FILTER (
             WHERE "${p.text}" IS DISTINCT FROM
                   to_char("${p.tz}" AT TIME ZONE 'UTC', ${RENDER})
           )::int AS differing
         FROM "${p.table}"`
      );

      const r = rows[0];
      checked++;

      // Null parity matters as much as value equality: a value that became
      // null is a value that was lost, and it would not show up as a
      // differing string.
      const parity = r.text_set === r.tz_set;
      const ok = r.differing === 0 && parity;
      if (!ok) mismatches++;

      const label = `${p.table}.${p.text}`.padEnd(36);
      const detail =
        r.total === 0
          ? "empty"
          : `${r.text_set}/${r.total} set` +
            (parity ? "" : `  NULL PARITY BROKEN (${r.text_set} text vs ${r.tz_set} tz)`) +
            (r.differing ? `  ${r.differing} DIFFER` : "");

      console.log(`  ${label} ${ok ? "ok  " : "FAIL"}  ${detail}`);
    }

    console.log("");
    if (missing) {
      console.log(`${missing} column pair(s) not present. Run: npm run migrate\n`);
      process.exitCode = 1;
    } else if (mismatches) {
      console.log(
        `${mismatches} column(s) did not round-trip.\n` +
          "Do NOT swap reads onto the new columns. Inspect the differing rows first.\n"
      );
      process.exitCode = 1;
    } else {
      console.log(
        `All ${checked} converted columns match their originals exactly.\n` +
          "Safe to swap reads in the next release.\n"
      );
    }
  } catch (err) {
    console.error("Could not verify:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
