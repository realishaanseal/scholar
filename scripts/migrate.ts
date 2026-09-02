/**
 * Apply pending schema migrations, then exit.
 *
 * The app also migrates lazily on its first query, so this is not required —
 * but running it as a deploy step means the schema is already current before
 * the first request arrives, rather than the first cold start paying for it.
 *
 *   npm run migrate
 */
import { Pool } from "pg";
import { runMigrations, MIGRATIONS } from "../src/lib/migrations";
import { requireDatabaseUrl } from "./loadEnv";

async function main() {
  const connectionString = requireDatabaseUrl();

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 1,
  });

  try {
    console.log(`${MIGRATIONS.length} migration(s) known.`);
    const { applied, adopted, alreadyCurrent } = await runMigrations(pool);

    if (alreadyCurrent) {
      console.log("Already up to date — nothing to apply.");
    }
    for (const id of adopted) {
      console.log(`adopted  ${id}  (tables already present; recorded, not executed)`);
    }
    for (const id of applied) {
      console.log(`applied  ${id}`);
    }
  } catch (err) {
    console.error("Migration failed:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
