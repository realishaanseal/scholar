/**
 * 0001 — baseline.
 *
 * The schema exactly as it stood when versioned migrations were introduced,
 * lifted verbatim from the SCHEMA string that lib/db.ts used to apply lazily
 * on first query. It is reproduced unchanged rather than tidied so that a
 * fresh database and a long-running one converge on identical structure.
 *
 * On a database that already has these tables this migration is recorded as
 * applied without being run (see adoptBaseline in ./index.ts) — every
 * statement is IF NOT EXISTS, so running it would be harmless, but recording
 * it keeps the ledger honest about what actually executed.
 *
 * New migrations should NOT follow this file's conventions: use snake_case
 * columns so they bypass the camelCase quoting shim, and timestamptz rather
 * than TEXT for timestamps.
 */

const NOW_ISO_SQL = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const sql = `

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
  focusSeconds INTEGER NOT NULL DEFAULT 0,
  -- Set when this task was created by an external sync (LMS ICS import,
  -- Google Calendar sync) rather than typed/spoken by the student directly.
  -- Lets a resync update the existing row instead of relying on fuzzy
  -- title-matching, and lets a Google Calendar push know which event a task
  -- is already mirrored to.
  externalId     TEXT,
  externalSource TEXT
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
  themeAccent       TEXT,
  updatedAt         TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

-- Added after the table's initial release — Postgres supports adding a
-- column to an existing table idempotently, so this runs safely on every
-- boot rather than needing a one-off migration step.
ALTER TABLE academic_profile ADD COLUMN IF NOT EXISTS themeAccent TEXT;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS externalId TEXT;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS externalSource TEXT;
-- Set the moment the extension successfully authenticates a capture with
-- this token — the only honest signal that a pasted token actually works,
-- as opposed to just being displayed. Settings shows this so "did I set the
-- extension up right?" has a real answer instead of a hope.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS captureTokenLastUsedAt TEXT;
-- The student's LMS calendar-feed URL, saved once so "Import from your
-- school" doesn't need re-pasting on every visit. platform is the detected
-- LmsId (see src/lib/lms), stored alongside so the UI can restore which
-- platform chip was selected without re-matching the URL on every load.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lmsFeedUrl TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lmsFeedPlatform TEXT;

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

-- Added after the table's initial release, same idempotent pattern as above.
-- Powers the "Classes" live-timetable feature: who's teaching, shown next to
-- the current/next class card. Optional — older rows and manual fixes that
-- skip it just don't show a teacher line.
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS teacherName TEXT;

-- Distinguishes an actual class from a break/library period, so the live
-- "Classes" view can say "on a break" instead of pretending nothing is
-- scheduled, and so the timetable import can capture breaks and library
-- periods as real rows instead of silently dropping them. 'class' by
-- default keeps every pre-existing row exactly as it behaved before this
-- column existed.
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'class';

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

-- One flag per report on a group task, one per reporter — many flags make a
-- post visibly disputed without any single reporter being able to remove it
-- outright, and the UNIQUE stops one person inflating the count by re-reporting.
CREATE TABLE IF NOT EXISTS group_task_reports (
  id        TEXT PRIMARY KEY,
  taskId    TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
  groupId   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason    TEXT NOT NULL DEFAULT 'wrong',
  note      TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  UNIQUE (taskId, userId)
);

-- One attachment per discussion comment. Kept in its own table (mirroring the
-- homework attachments table) rather than a column on group_comments, since
-- an attachment is optional and this keeps large payloads out of the row
-- that's fetched on every comment list.
CREATE TABLE IF NOT EXISTS group_comment_attachments (
  id         TEXT PRIMARY KEY,
  commentId  TEXT NOT NULL REFERENCES group_comments(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mimeType   TEXT NOT NULL DEFAULT 'application/octet-stream',
  size       INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL,
  createdAt  TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);
CREATE INDEX IF NOT EXISTS idx_group_task_reports_task ON group_task_reports(taskId);
CREATE INDEX IF NOT EXISTS idx_group_comment_attachments_comment ON group_comment_attachments(commentId);

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

-- One Google account connected per user. Tokens are encrypted at rest with
-- the same AES-256-GCM scheme user_settings.apiKeyCipher uses (see crypto.ts)
-- — never stored in plain text, and unreadable without AUTH_SECRET.
CREATE TABLE IF NOT EXISTS calendar_connections (
  userId            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'google',
  accessTokenCipher TEXT,
  refreshTokenCipher TEXT NOT NULL,
  tokenExpiresAt    TEXT,
  scope             TEXT,
  calendarId        TEXT NOT NULL DEFAULT 'primary',
  -- Google's incremental-sync cursor (see the events.list syncToken param).
  -- Null means "no successful sync yet, do a full pull."
  syncToken         TEXT,
  lastSyncedAt      TEXT,
  lastSyncError     TEXT,
  createdAt         TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
);

-- The correlation between one Scholar task and one Google Calendar event —
-- however that pairing came to exist (pulled in from Google, or pushed out
-- from a task the student typed here). Whichever side changes, this is what a
-- sync uses to find "the same thing" on the other side instead of comparing
-- titles, which breaks the moment either side edits one.
CREATE TABLE IF NOT EXISTS calendar_links (
  id            TEXT PRIMARY KEY,
  userId        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  homeworkId    TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'google',
  externalEventId TEXT NOT NULL,
  -- Last known modification timestamp on each side, used to decide which way
  -- a change should flow when both sides moved since the last sync.
  lastPushedAt  TEXT,
  lastPulledAt  TEXT,
  createdAt     TEXT NOT NULL DEFAULT ${NOW_ISO_SQL},
  UNIQUE (userId, homeworkId, provider),
  UNIQUE (userId, provider, externalEventId)
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_capture_token
  ON user_settings(captureToken) WHERE captureToken IS NOT NULL;
-- One external item (a Canvas ICS UID, a Google Calendar event id) maps to at
-- most one homework row per user per source — this is what a resync checks
-- against to update in place instead of creating a near-duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_external
  ON homework(userId, externalSource, externalId) WHERE externalId IS NOT NULL;
`;
