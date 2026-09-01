import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { runMigrations, MIGRATIONS } from "@/lib/migrations";

/*
  The migration runner decides, on a database it has never seen, whether to
  execute the baseline or merely record it. Getting that backwards is the
  worst outcome in this whole area: executing against a populated database is
  survivable (every baseline statement is IF NOT EXISTS), but recording a
  baseline that never ran on an empty database would leave the ledger claiming
  a schema that does not exist, and every later migration would build on sand.

  That decision, the advisory locking around it, and the rollback path are all
  pure control flow over a pg client, so they are tested against a recording
  fake rather than a live Postgres. The SQL itself is exercised by the
  integration suite once a throwaway database exists.
*/

type Canned = { rows: any[] };

function fakePool(opts: {
  usersTableExists: boolean;
  alreadyApplied?: string[];
  failOn?: RegExp;
}) {
  const log: string[] = [];
  const released: boolean[] = [];

  const client = {
    async query(text: string, params?: unknown[]): Promise<Canned> {
      log.push(text.trim().split("\n")[0].trim());

      if (opts.failOn?.test(text)) throw new Error("simulated failure");

      if (/FROM schema_migrations/.test(text)) {
        return { rows: (opts.alreadyApplied ?? []).map((id) => ({ id })) };
      }
      if (/to_regclass/.test(text)) {
        return { rows: [{ present: opts.usersTableExists }] };
      }
      if (/INSERT INTO schema_migrations/.test(text)) {
        log.push(`  -> ledger ${params?.[0]} adopted=${params?.[1]}`);
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {
      released.push(true);
    },
  };

  const pool = {
    async connect() {
      return client;
    },
    async query(text: string): Promise<Canned> {
      return client.query(text);
    },
  } as unknown as Pool;

  return { pool, log, released };
}

const ran = (log: string[], re: RegExp) => log.some((l) => re.test(l));

describe("migration inventory", () => {
  it("has unique, lexically ordered ids", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("confines the camelCase quoting shim to the baseline", () => {
    // The shim rewrites identifiers by regex and cannot distinguish an
    // identifier from mixed-case text inside a string literal. Any new
    // migration opting into it is a mistake worth failing the build over.
    for (const m of MIGRATIONS) {
      if (m.id !== "0001_baseline") expect(m.legacyCamelCase ?? false).toBe(false);
    }
  });

  it("ships a baseline that actually contains the schema", () => {
    const baseline = MIGRATIONS.find((m) => m.id === "0001_baseline");
    expect(baseline).toBeDefined();
    expect(baseline!.sql).toMatch(/CREATE TABLE IF NOT EXISTS users/);
    expect(baseline!.sql).toMatch(/CREATE TABLE IF NOT EXISTS homework/);
  });
});

describe("runMigrations on a fresh database", () => {
  it("executes the baseline and records it as applied", async () => {
    const { pool, log } = fakePool({ usersTableExists: false });
    const result = await runMigrations(pool);

    // Asserted against the list rather than a literal, so adding a migration
    // does not fail a test about how a fresh database is treated.
    expect(result.applied).toEqual(MIGRATIONS.map((m) => m.id));
    expect(result.adopted).toEqual([]);
    expect(ran(log, /CREATE TABLE IF NOT EXISTS users/)).toBe(true);
    expect(ran(log, /ledger 0001_baseline adopted=false/)).toBe(true);
  });
});

describe("runMigrations on a database that predates the ledger", () => {
  it("records the baseline without executing it", async () => {
    const { pool, log } = fakePool({ usersTableExists: true });
    const result = await runMigrations(pool);

    // Only the baseline is adopted; everything after it is genuinely new to
    // this database and must actually run.
    expect(result.adopted).toEqual(["0001_baseline"]);
    expect(result.applied).toEqual(MIGRATIONS.slice(1).map((m) => m.id));
    // The distinction that matters: the schema was not touched.
    expect(ran(log, /CREATE TABLE IF NOT EXISTS users/)).toBe(false);
    expect(ran(log, /ledger 0001_baseline adopted=true/)).toBe(true);
  });
});

describe("runMigrations on an up-to-date database", () => {
  it("does nothing and says so", async () => {
    const { pool, log } = fakePool({
      usersTableExists: true,
      alreadyApplied: MIGRATIONS.map((m) => m.id),
    });
    const result = await runMigrations(pool);

    expect(result.alreadyCurrent).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.adopted).toEqual([]);
    expect(ran(log, /^BEGIN$/)).toBe(false);
  });

  it("does not re-probe for a pre-existing database once the ledger is populated", async () => {
    // The probe answer flips the moment the baseline runs, so asking again
    // later would be meaningless. It must only be consulted on an empty ledger.
    const { pool, log } = fakePool({
      usersTableExists: true,
      alreadyApplied: ["0001_baseline"],
    });
    await runMigrations(pool);
    expect(ran(log, /to_regclass/)).toBe(false);
  });
});

describe("locking and failure handling", () => {
  it("serialises callers with an advisory lock and always releases it", async () => {
    const { pool, log, released } = fakePool({ usersTableExists: false });
    await runMigrations(pool);

    expect(ran(log, /pg_advisory_lock/)).toBe(true);
    expect(ran(log, /pg_advisory_unlock/)).toBe(true);
    expect(released).toEqual([true]);
  });

  it("rolls back a failed migration and surfaces which one broke", async () => {
    const { pool, log } = fakePool({
      usersTableExists: false,
      failOn: /CREATE TABLE IF NOT EXISTS users/,
    });

    await expect(runMigrations(pool)).rejects.toThrow(/0001_baseline failed/);
    expect(ran(log, /^ROLLBACK$/)).toBe(true);
    // Nothing may be recorded for a migration that did not complete.
    expect(ran(log, /ledger 0001_baseline/)).toBe(false);
  });

  it("releases the lock and the client even when a migration throws", async () => {
    const { pool, log, released } = fakePool({
      usersTableExists: false,
      failOn: /CREATE TABLE IF NOT EXISTS users/,
    });

    await expect(runMigrations(pool)).rejects.toThrow();
    expect(ran(log, /pg_advisory_unlock/)).toBe(true);
    expect(released).toEqual([true]);
  });
});
