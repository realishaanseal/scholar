import { db } from "@/lib/db";
import type { WorkspaceId } from "./workspaces";

/**
 * Resolving which workspaces a person may enter.
 *
 * Separate from workspaces.ts because that module is imported by AppShell,
 * which is a client component — and importing the database from it pulls pg,
 * and therefore node's `fs`, into the browser bundle. The build says so
 * loudly, but only after the mistake is made, so the split is the fix rather
 * than the reminder. The .server suffix is the convention that carries it:
 * anything named that way must not be imported from a "use client" file, and
 * a test asserts none is.
 *
 * Personal is offered when it is somebody's, not by default.
 *
 * It used to be unconditional, on the reasoning that a teacher already using
 * Scholar for their own planning should not lose it the day a school adds
 * them to a section. That reasoning still holds for that person — and it was
 * being applied to everybody, including staff who have never had a task of
 * their own and for whom a Homework tab is somebody else's tool sitting in
 * their navigation.
 *
 * So it is offered on evidence: they are enrolled somewhere, or they have
 * actually used it. A purely institutional account gets purely institutional
 * workspaces.
 *
 * The last clause matters more than it looks. Somebody with no memberships and
 * no personal data — a fresh account, moments after signing up — must still
 * land somewhere, so personal is the fallback when nothing else applies. An
 * empty navigation would be a worse bug than an unnecessary tab.
 */
export async function availableWorkspaces(userId: string): Promise<WorkspaceId[]> {
  const [teaches, admins, enrolled, hasOwnWork] = await Promise.all([
    db
      .prepare(`SELECT 1 AS present FROM section_teachers WHERE user_id = ? LIMIT 1`)
      .get(userId),
    db
      .prepare(
        `SELECT 1 AS present FROM organization_memberships
          WHERE user_id = ? AND status = 'active'
            AND role IN ('INSTITUTION_ADMIN', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
          LIMIT 1`
      )
      .get(userId),
    db
      .prepare(
        `SELECT 1 AS present FROM enrollments
          WHERE user_id = ? AND status = 'active' LIMIT 1`
      )
      .get(userId),
    // Any trace of them using Scholar for themselves. Homework covers the
    // common case; a timetable alone is enough to mean they have been here.
    db
      .prepare(
        // EXISTS rather than a UNION of limited selects: Postgres will not
        // accept LIMIT immediately before UNION, and three EXISTS clauses
        // short-circuit anyway — the first match ends the query.
        `SELECT 1 AS present
          WHERE EXISTS (SELECT 1 FROM homework  WHERE "userId" = ?)
             OR EXISTS (SELECT 1 FROM timetable WHERE "userId" = ?)
             OR EXISTS (SELECT 1 FROM subjects  WHERE "userId" = ?)`
      )
      .get(userId, userId, userId),
  ]);

  const out: WorkspaceId[] = [];
  if (enrolled || hasOwnWork) out.push("personal");
  if (teaches) out.push("teaching");
  if (admins) out.push("admin");

  // Never nothing.
  return out.length > 0 ? out : ["personal"];
}
