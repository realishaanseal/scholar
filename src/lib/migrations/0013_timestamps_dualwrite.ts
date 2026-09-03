/**
 * 0013 — keep the two copies of every date in step.
 *
 * 0012 added timestamptz siblings and backfilled them. Without this migration
 * that backfill starts rotting immediately: the next row anyone creates sets
 * the text column and leaves its sibling null, and by the time someone runs
 * the verification before a swap it reports failures caused entirely by the
 * gap rather than by anything wrong with the conversion.
 *
 * Done with triggers rather than by editing the write sites. There are six
 * places that write these tables, one of which builds its SET clause
 * dynamically from a list of changed fields — so "remember to also set the
 * _tz column" would be a rule that has to hold in code that does not exist
 * yet. A trigger holds it for every writer, including future ones, including
 * a psql session during an incident.
 *
 * The direction is deliberately one-way: text is the source of truth and the
 * timestamptz column follows it. Reads still come from the text column, so
 * making the new one authoritative before anything reads it would mean the
 * swap changed two things at once.
 *
 * All of this is temporary by design. The contract migration that drops the
 * text columns drops these triggers with them, and at that point the
 * timestamptz columns simply are the data.
 */
export const sql = `
CREATE OR REPLACE FUNCTION sync_iso_text_to_tz() RETURNS trigger AS $$
DECLARE
  pair    text[];
  src     text;
  dst     text;
  val     text;
BEGIN
  -- Pairs arrive as trigger arguments: 'dueAt', 'due_at_tz', 'createdAt', ...
  FOR i IN 0 .. (TG_NARGS / 2 - 1) LOOP
    src := TG_ARGV[i * 2];
    dst := TG_ARGV[i * 2 + 1];

    EXECUTE format('SELECT ($1).%I::text', src) INTO val USING NEW;

    -- An empty string is not a date. Treating it as null rather than letting
    -- the cast raise keeps a bad write from taking down the row it is part of.
    IF val IS NULL OR val = '' THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(dst, NULL));
    ELSE
      NEW := jsonb_populate_record(NEW, jsonb_build_object(dst, val));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homework_tz ON homework;
CREATE TRIGGER trg_homework_tz
  BEFORE INSERT OR UPDATE ON homework
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz(
    'dueAt', 'due_at_tz',
    'createdAt', 'created_at_tz',
    'updatedAt', 'updated_at_tz',
    'completedAt', 'completed_at_tz',
    'startedAt', 'started_at_tz'
  );

DROP TRIGGER IF EXISTS trg_task_events_tz ON task_events;
CREATE TRIGGER trg_task_events_tz
  BEFORE INSERT OR UPDATE ON task_events
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz(
    'dueAt', 'due_at_tz',
    'completedAt', 'completed_at_tz',
    'createdAt', 'created_at_tz'
  );

DROP TRIGGER IF EXISTS trg_subjects_tz ON subjects;
CREATE TRIGGER trg_subjects_tz
  BEFORE INSERT OR UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('createdAt', 'created_at_tz');

DROP TRIGGER IF EXISTS trg_timetable_tz ON timetable;
CREATE TRIGGER trg_timetable_tz
  BEFORE INSERT OR UPDATE ON timetable
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('createdAt', 'created_at_tz');

DROP TRIGGER IF EXISTS trg_academic_profile_tz ON academic_profile;
CREATE TRIGGER trg_academic_profile_tz
  BEFORE INSERT OR UPDATE ON academic_profile
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('updatedAt', 'updated_at_tz');

DROP TRIGGER IF EXISTS trg_user_settings_tz ON user_settings;
CREATE TRIGGER trg_user_settings_tz
  BEFORE INSERT OR UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('updatedAt', 'updated_at_tz');

DROP TRIGGER IF EXISTS trg_dismissed_signals_tz ON dismissed_signals;
CREATE TRIGGER trg_dismissed_signals_tz
  BEFORE INSERT OR UPDATE ON dismissed_signals
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('dismissedAt', 'dismissed_at_tz');

DROP TRIGGER IF EXISTS trg_users_tz ON users;
CREATE TRIGGER trg_users_tz
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('createdAt', 'created_at_tz');

DROP TRIGGER IF EXISTS trg_groups_tz ON groups;
CREATE TRIGGER trg_groups_tz
  BEFORE INSERT OR UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('createdAt', 'created_at_tz');

DROP TRIGGER IF EXISTS trg_group_members_tz ON group_members;
CREATE TRIGGER trg_group_members_tz
  BEFORE INSERT OR UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('joinedAt', 'joined_at_tz');

DROP TRIGGER IF EXISTS trg_group_tasks_tz ON group_tasks;
CREATE TRIGGER trg_group_tasks_tz
  BEFORE INSERT OR UPDATE ON group_tasks
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz(
    'dueAt', 'due_at_tz',
    'createdAt', 'created_at_tz'
  );

DROP TRIGGER IF EXISTS trg_group_comments_tz ON group_comments;
CREATE TRIGGER trg_group_comments_tz
  BEFORE INSERT OR UPDATE ON group_comments
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz('createdAt', 'created_at_tz');

DROP TRIGGER IF EXISTS trg_share_grants_tz ON share_grants;
CREATE TRIGGER trg_share_grants_tz
  BEFORE INSERT OR UPDATE ON share_grants
  FOR EACH ROW EXECUTE FUNCTION sync_iso_text_to_tz(
    'createdAt', 'created_at_tz',
    'expiresAt', 'expires_at_tz',
    'revokedAt', 'revoked_at_tz'
  );
`;
