import type { Pool } from "pg";
import { quoteCamelIdentifiers } from "../sqlCase";
import { sql as baseline } from "./0001_baseline";
import { sql as organizations } from "./0002_organizations";
import { sql as courses } from "./0003_courses";
import { sql as assignments } from "./0004_assignments";
import { sql as files } from "./0005_files";
import { sql as accountIntent } from "./0006_account_intent";
import { sql as gradebook } from "./0007_gradebook";
import { sql as quizzes } from "./0008_quizzes";
import { sql as aiAssistance } from "./0009_ai_assistance";
import { sql as governance } from "./0010_governance";
import { sql as time } from "./0011_time";
import { sql as timestampsExpand } from "./0012_timestamps_expand";
import { sql as timestampsDualWrite } from "./0013_timestamps_dualwrite";
import { sql as gradingScheme } from "./0014_grading_scheme";
import { sql as aiPolicy } from "./0015_ai_policy";
import { sql as invitations } from "./0016_invitations";
import { sql as rubrics } from "./0017_rubrics";
import { sql as announcements } from "./0018_announcements";
import { sql as differentiation } from "./0019_differentiation";

/**
 * Versioned schema migrations.
 *
 * Before this, the schema was one template string applied lazily on first
 * query with CREATE TABLE IF NOT EXISTS and a growing list of ADD COLUMN IF
 * NOT EXISTS. That is only able to express additive change: it cannot rename
 * a column, alter a type, backfill data, or be rolled back — all of which the
 * LMS work needs.
 *
 * Migrations are TypeScript modules exporting a SQL string rather than .sql
 * files read from disk. On a serverless deploy the filesystem is a bundling
 * concern, and an unreadable migration directory would surface as a runtime
 * failure on a cold start; imported modules are traced by the bundler like
 * any other code.
 */

export type Migration = {
  /** Sort key and ledger id. Zero-padded so lexical order is apply order. */
  id: string;
  sql: string;
  /**
   * Run the SQL through the camelCase quoting shim before executing.
   *
   * True only for the baseline, whose columns are camelCase and would
   * otherwise be folded to lowercase by Postgres. New migrations must use
   * snake_case and leave this off — the shim rewrites identifiers by regex and
   * cannot tell an identifier from mixed-case text inside a string literal,
   * so keeping it away from new SQL is deliberate containment of a known
   * sharp edge rather than an oversight.
   */
  legacyCamelCase?: boolean;
};

export const MIGRATIONS: Migration[] = [
  { id: "0001_baseline", sql: baseline, legacyCamelCase: true },
  { id: "0002_organizations", sql: organizations },
  { id: "0003_courses", sql: courses },
  { id: "0004_assignments", sql: assignments },
  { id: "0005_files", sql: files },
  { id: "0006_account_intent", sql: accountIntent },
  { id: "0007_gradebook", sql: gradebook },
  { id: "0008_quizzes", sql: quizzes },
  { id: "0009_ai_assistance", sql: aiAssistance },
  { id: "0010_governance", sql: governance },
  { id: "0011_time", sql: time },
  { id: "0012_timestamps_expand", sql: timestampsExpand },
  { id: "0013_timestamps_dualwrite", sql: timestampsDualWrite },
  { id: "0014_grading_scheme", sql: gradingScheme },
  { id: "0015_ai_policy", sql: aiPolicy },
  { id: "0016_invitations", sql: invitations },
  { id: "0017_rubrics", sql: rubrics },
  { id: "0018_announcements", sql: announcements },
  { id: "0019_differentiation", sql: differentiation },
];

/** Arbitrary but fixed: two deploys booting at once must pick the same lock. */
const ADVISORY_LOCK_KEY = 4207332001;

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    -- Recorded rather than executed, because the database predates this system.
    adopted     boolean NOT NULL DEFAULT false
  )
`;

/**
 * A database that predates versioned migrations already has the baseline's
 * tables. Running the baseline against it would be harmless — every statement
 * is IF NOT EXISTS — but recording it as *applied* would claim something that
 * never happened. It is marked adopted instead, so the ledger distinguishes
 * "we ran this" from "this was already here when we started counting".
 */
async function isPreExistingDatabase(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT to_regclass('public.users') IS NOT NULL AS present`
  );
  return Boolean(rows[0]?.present);
}

export type MigrationResult = { applied: string[]; adopted: string[]; alreadyCurrent: boolean };

/**
 * Bring the database up to date. Safe to call concurrently: a Postgres
 * advisory lock serialises callers, so several serverless instances booting
 * at once cannot apply the same migration twice.
 */
export async function runMigrations(pool: Pool): Promise<MigrationResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  const adopted: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    await client.query(LEDGER);

    const { rows } = await client.query(`SELECT id FROM schema_migrations`);
    const done = new Set(rows.map((r: { id: string }) => r.id));

    // Decided once, before anything is applied: after the first migration runs
    // the users table exists either way, and the answer would flip.
    const preExisting = done.size === 0 && (await isPreExistingDatabase(pool));

    for (const migration of MIGRATIONS) {
      if (done.has(migration.id)) continue;

      const adopt = preExisting && migration.id === "0001_baseline";

      // One transaction per migration: Postgres DDL is transactional, so a
      // failure leaves the schema and the ledger consistent with each other.
      await client.query("BEGIN");
      try {
        if (!adopt) {
          const statement = migration.legacyCamelCase
            ? quoteCamelIdentifiers(migration.sql)
            : migration.sql;
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO schema_migrations (id, adopted) VALUES ($1, $2)`,
          [migration.id, adopt]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(
          `Migration ${migration.id} failed and was rolled back: ${(err as Error).message}`
        );
      }

      (adopt ? adopted : applied).push(migration.id);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
  }

  return { applied, adopted, alreadyCurrent: applied.length === 0 && adopted.length === 0 };
}
