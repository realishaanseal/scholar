/**
 * 0020 — attendance.
 *
 * Not optional in K-12 anywhere, and in much of India and the Gulf it is a
 * statutory record rather than a convenience. Schoology passes it to the
 * student information system automatically; Scholar could not record it at
 * all.
 *
 * Two tables because a register is two things: an occasion — this class, this
 * day, taken by this person at this time — and what was said about each
 * student on it. Flattening them would leave no way to distinguish "nobody
 * has taken the register" from "everybody was present", which are extremely
 * different facts about a Tuesday morning.
 *
 * Corrections go to audit_log rather than a fourth table here. A register is a
 * legal document and "who changed this from absent to present, and when" has
 * to be answerable — but that is exactly what the audit log already is, and a
 * second append-only trail would be a second thing to keep honest.
 *
 * What this deliberately does not do is feed the risk engine. Attendance is
 * institutional data and an administrator may see it, in the same way they
 * may see marking turnaround. The moment it becomes an input to a per-student
 * prediction, Scholar is profiling children on their presence — and the
 * correlation it would find is mostly poverty, illness and caring
 * responsibilities. That is a machine for confirming a school's existing
 * assumptions about its poorest students, and it is not being built.
 */
export const sql = `
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id                text PRIMARY KEY,
  organization_id   text NOT NULL,
  course_section_id text NOT NULL,
  -- A calendar day rather than an instant: a register belongs to a school
  -- day, and which one it is must not shift because a teacher took it from
  -- an airport.
  on_date           date NOT NULL,
  -- Optional, for schools that take a register per period rather than per
  -- day. Null means the day's single register.
  period            text,
  taken_by          text REFERENCES users(id) ON DELETE SET NULL,
  taken_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (course_section_id, on_date, period),
  FOREIGN KEY (organization_id, course_section_id)
    REFERENCES course_sections (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_marks (
  id               text PRIMARY KEY,
  organization_id  text NOT NULL,
  session_id       text NOT NULL,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The four states a school actually uses. 'excused' is distinct from
  -- 'absent' on purpose: an authorised absence is not a mark against anyone,
  -- and collapsing them is how a register becomes unfair.
  state            text NOT NULL,
  -- Minutes late, where that is recorded. Some schools report on it.
  minutes_late     integer,
  note             text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES attendance_sessions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT attendance_state_known
    CHECK (state IN ('present', 'absent', 'late', 'excused')),
  CONSTRAINT attendance_minutes_sane
    CHECK (minutes_late IS NULL OR (minutes_late >= 0 AND minutes_late <= 600))
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_section
  ON attendance_sessions(course_section_id, on_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_marks_session
  ON attendance_marks(session_id);
-- "This student's attendance this term" — the question a form tutor, a
-- parent and an education welfare officer all ask.
CREATE INDEX IF NOT EXISTS idx_attendance_marks_user
  ON attendance_marks(user_id);
`;
