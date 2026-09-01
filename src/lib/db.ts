import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { quoteCamelIdentifiers } from "./sqlCase";
import { runMigrations } from "./migrations";

/**
 * Hosted storage (Postgres — Neon/Supabase/anything Postgres-compatible).
 *
 * This used to be a single SQLite file (see git history). The schema, and the
 * shape every call site uses (`db.prepare(sql).get/all/run(...)`), are kept as
 * close as possible to that version on purpose — the SQL itself barely
 * changed, only "synchronous" became "returns a Promise". `?` placeholders are
 * translated to Postgres's `$1, $2, ...` automatically, so nearly every query
 * string in the codebase is untouched from the SQLite version.
 */

// Both the connection-string check and the Pool itself are built lazily, on
// first actual use rather than at module import — Next.js imports route
// modules (and therefore this file) during `next build`'s page-data
// collection step, and neither a missing env var nor a live connection
// attempt should be able to fail that step for routes that never even run.
const globalForDb = globalThis as unknown as { __scholarPool?: Pool };

function getPool(): Pool {
  if (globalForDb.__scholarPool) return globalForDb.__scholarPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Postgres connection string (Neon's pooled " +
        "connection string is recommended for serverless — see .env.example)."
    );
  }

  // Small pool: each serverless function instance should hold very few
  // connections. Neon's pooled ("-pooler") connection string handles the rest.
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  });

  globalForDb.__scholarPool = pool;
  return pool;
}

// When db.transaction() is active, every db.prepare(...).get/all/run() call
// inside its callback should run on the SAME client (so BEGIN/COMMIT actually
// wrap them) rather than grabbing a fresh connection from the pool. This is
// how that happens without threading a `tx` object through every call site.
const txStorage = new AsyncLocalStorage<PoolClient>();

function executor(): Pool | PoolClient {
  return txStorage.getStore() ?? getPool();
}

/** `?` placeholders (SQLite style) -> `$1, $2, ...` (Postgres style), in order. */
function toPgSql(sql: string): string {
  let i = 0;
  return quoteCamelIdentifiers(sql).replace(/\?/g, () => `$${++i}`);
}

type RunResult = { changes: number };

class Statement {
  constructor(private readonly sql: string) {}

  private async exec(params: unknown[]) {
    await ready();
    return executor().query(toPgSql(this.sql), params);
  }

  /** Mirrors better-sqlite3's `.get(...)`: first row, or undefined. */
  async get(...params: unknown[]): Promise<any | undefined> {
    const res = await this.exec(params);
    return res.rows[0];
  }

  /** Mirrors better-sqlite3's `.all(...)`: every row. */
  async all(...params: unknown[]): Promise<any[]> {
    const res = await this.exec(params);
    return res.rows;
  }

  /** Mirrors better-sqlite3's `.run(...)`: `{ changes }` (rows affected). */
  async run(...params: unknown[]): Promise<RunResult> {
    const res = await this.exec(params);
    return { changes: res.rowCount ?? 0 };
  }
}

export const db = {
  prepare(sql: string): Statement {
    return new Statement(sql);
  },

  /**
   * Mirrors better-sqlite3's `db.transaction(fn)`: returns a function that,
   * when called, runs `fn` with every db.prepare(...) call inside it scoped to
   * one connection and one BEGIN/COMMIT/ROLLBACK.
   *
   * Only real difference from the SQLite version: `fn` and the returned
   * function are both async now, so call sites need `await`.
   */
  transaction<T>(fn: () => Promise<T> | T): () => Promise<T> {
    return async () => {
      await ready();
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const result = await txStorage.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    };
  },
};

export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Migrations run lazily, on the first real query rather than at module import
 * — Next.js imports route modules (and therefore this file) during `next
 * build`'s page-data-collection step, and a Postgres connection can hang or
 * fail if it runs eagerly there.
 *
 * This used to apply one idempotent SCHEMA string; it now delegates to the
 * versioned migration runner, which takes an advisory lock so concurrent cold
 * starts cannot apply the same migration twice. Deployments that would rather
 * migrate explicitly before traffic arrives can run `npm run migrate` — this
 * then finds nothing pending and is a single cheap query.
 */
let schemaApplied: Promise<void> | null = null;

function ready(): Promise<void> {
  if (!schemaApplied) {
    schemaApplied = runMigrations(getPool()).then(() => undefined);
  }
  return schemaApplied;
}
