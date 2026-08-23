import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

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

/**
 * Postgres folds every UNQUOTED identifier to lowercase — both when creating
 * a column and when returning it in a result row. Every table in this schema
 * was named snake_case (unaffected), but the COLUMNS are camelCase
 * (`userId`, `dueAt`, `subjectName`, ...) to match the original SQLite
 * database, where identifiers keep whatever case you write. Left alone,
 * "userId" would silently become "userid" everywhere — a working query that
 * returns a row with no `.userId` property on it, only `.userid`.
 *
 * Rather than manually double-quoting every identifier across every query
 * string in the codebase, this wraps any genuinely mixed-case token (has
 * both an uppercase and a lowercase letter) in double quotes wherever it
 * appears — in CREATE TABLE, SELECT lists, WHERE clauses, ON CONFLICT
 * targets, aliases, all of it — which tells Postgres to preserve that exact
 * case rather than fold it. SQL keywords (SELECT, FROM, ON CONFLICT, ...)
 * and this codebase's snake_case table names are all single-case, so they
 * never match and pass through untouched. (This does not attempt to spare
 * mixed-case text inside quoted string literals — there aren't any in this
 * schema's SQL; a future literal with camelCase text would need its own
 * escaping.)
 */
function quoteCamelIdentifiers(sql: string): string {
  return sql.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (token) =>
    /[A-Z]/.test(token) && /[a-z]/.test(token) ? `"${token}"` : token
  );
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
 * Every timestamp default below produces the exact same shape `nowISO()`
 * does (e.g. "2026-08-22T17:01:35.023Z"), since the rest of the app compares
 * and parses these as ISO strings — including a Postgres-native `timestamp`
 * type here would format differently and quietly break that.
 */
const NOW_ISO_SQL = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  email         TEXT UNIQUE,
  emailVerified TEXT,
  image         TEXT,
  passwordHash  TEXT,
  createdAt     TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  userId            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token     TEXT,
  access_token      TEXT,
  expires_at        INTEGER,
  token_type        TEXT,
  scope             TEXT,
  id_token          TEXT,
  session_state     TEXT,
  UNIQUE (provider, providerAccountId)
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  sessionToken TEXT NOT NULL UNIQUE,
  userId       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires    TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS subjects (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#5b7cfa',
  createdAt TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  UNIQUE (userId, name)
);

CREATE TABLE IF NOT EXISTS homework (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subjectId    TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  details      TEXT NOT NULL DEFAULT '',
  rawInput     TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'text',
  dueAt        TEXT,
  estimateMins INTEGER,
  priority     TEXT NOT NULL DEFAULT 'normal',
  status       TEXT NOT NULL DEFAULT 'todo',
  aiConfidence DOUBLE PRECISION,
  aiNotes      TEXT NOT NULL DEFAULT '',
  createdAt    TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  updatedAt    TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  completedAt  TEXT,
  actualMins   INTEGER,
  startedAt    TEXT,
  focusSeconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  homeworkId TEXT REFERENCES homework(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mimeType   TEXT NOT NULL DEFAULT 'application/octet-stream',
  size       INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL,
  createdAt  TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS user_settings (
  userId       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  aiProvider   TEXT,
  aiModel      TEXT,
  apiKeyCipher TEXT,
  apiKeyHint   TEXT,
  captureToken TEXT,
  updatedAt    TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS task_events (
  id            TEXT PRIMARY KEY,
  userId        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  homeworkId    TEXT REFERENCES homework(id) ON DELETE SET NULL,
  subjectName   TEXT NOT NULL DEFAULT 'General',
  estimateMins  INTEGER,
  actualMins    INTEGER,
  dueAt         TEXT,
  completedAt   TEXT NOT NULL,
  onTime        INTEGER NOT NULL DEFAULT 1,
  difficulty    INTEGER,
  createdAt     TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS academic_profile (
  userId            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekdayMins       INTEGER NOT NULL DEFAULT 120,
  weekendMins       INTEGER NOT NULL DEFAULT 240,
  studyStartHour    INTEGER NOT NULL DEFAULT 16,
  studyEndHour      INTEGER NOT NULL DEFAULT 22,
  educationSystem   TEXT,
  interfaceLanguage TEXT,
  inputLanguage     TEXT,
  responseLanguage  TEXT,
  notifyPrefs       TEXT,
  updatedAt         TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS dismissed_signals (
  userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signalKey   TEXT NOT NULL,
  dismissedAt TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  PRIMARY KEY (userId, signalKey)
);

CREATE TABLE IF NOT EXISTS timetable (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subjectName TEXT,
  dayOfWeek   INTEGER NOT NULL,
  startHour   INTEGER NOT NULL,
  startMin    INTEGER NOT NULL DEFAULT 0,
  endHour     INTEGER NOT NULL,
  endMin      INTEGER NOT NULL DEFAULT 0,
  location    TEXT,
  createdAt   TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

/*
  ── Sharing ───────────────────────────────────────────────────────────────
  Everything below is opt-in. No row here is created by default, and a user
  with no groups and no grants has exactly the same private experience as
  before this tier existed.
*/

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'study-group',
  name        TEXT NOT NULL,
  subjectName TEXT,
  ownerUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joinCode    TEXT UNIQUE,
  createdAt   TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS group_members (
  groupId  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  userId   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member',
  joinedAt TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  PRIMARY KEY (groupId, userId)
);

CREATE TABLE IF NOT EXISTS group_tasks (
  id            TEXT PRIMARY KEY,
  groupId       TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  createdBy     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  details       TEXT NOT NULL DEFAULT '',
  subjectName   TEXT,
  dueAt         TEXT,
  estimateMins  INTEGER,
  assignedTo    TEXT REFERENCES users(id) ON DELETE SET NULL,
  createdAt     TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS group_comments (
  id         TEXT PRIMARY KEY,
  groupId    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  taskId     TEXT REFERENCES group_tasks(id) ON DELETE CASCADE,
  userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  createdAt  TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

CREATE TABLE IF NOT EXISTS share_grants (
  id            TEXT PRIMARY KEY,
  subjectUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewerUserId  TEXT REFERENCES users(id) ON DELETE CASCADE,
  inviteCode    TEXT UNIQUE,
  scopes        TEXT NOT NULL DEFAULT '[]',
  label         TEXT NOT NULL DEFAULT '',
  createdAt     TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  expiresAt     TEXT,
  revokedAt     TEXT
);

CREATE INDEX IF NOT EXISTS idx_group_members_user  ON group_members(userId);
CREATE INDEX IF NOT EXISTS idx_group_tasks_group   ON group_tasks(groupId, dueAt);
CREATE INDEX IF NOT EXISTS idx_group_comments_task ON group_comments(groupId, taskId, createdAt);
CREATE INDEX IF NOT EXISTS idx_grants_subject      ON share_grants(subjectUserId);
CREATE INDEX IF NOT EXISTS idx_grants_viewer       ON share_grants(viewerUserId);
CREATE INDEX IF NOT EXISTS idx_timetable_user      ON timetable(userId, dayOfWeek);
CREATE INDEX IF NOT EXISTS idx_task_events_user    ON task_events(userId, completedAt);
CREATE INDEX IF NOT EXISTS idx_task_events_subject ON task_events(userId, subjectName);
CREATE INDEX IF NOT EXISTS idx_homework_user_due   ON homework(userId, dueAt);
CREATE INDEX IF NOT EXISTS idx_homework_user_status ON homework(userId, status);
CREATE INDEX IF NOT EXISTS idx_subjects_user       ON subjects(userId);
CREATE INDEX IF NOT EXISTS idx_attachments_homework ON attachments(homeworkId);
CREATE INDEX IF NOT EXISTS idx_attachments_user    ON attachments(userId);
`;

/**
 * Applied lazily, on the first real query rather than at module import —
 * Next.js imports route modules (and therefore this file) during `next
 * build`'s page-data-collection step, and a Postgres connection (unlike the
 * old local SQLite file) can hang or fail if it runs eagerly there. Postgres
 * supports `ADD COLUMN IF NOT EXISTS` directly, so — unlike the old SQLite
 * version — no column-introspection dance is needed to make this idempotent.
 */
let schemaApplied: Promise<void> | null = null;

function ready(): Promise<void> {
  if (!schemaApplied) {
    schemaApplied = getPool().query(quoteCamelIdentifiers(SCHEMA)).then(() => undefined);
  }
  return schemaApplied;
}
