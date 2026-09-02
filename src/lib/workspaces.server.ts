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
 * Personal is always present: it is the person's own account, and a teacher
 * who has been using Scholar for their own planning should not lose it the day
 * an institution adds them to a section. It simply stops being where they land.
 */
export async function availableWorkspaces(userId: string): Promise<WorkspaceId[]> {
  const [teaches, admins] = await Promise.all([
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
  ]);

  const out: WorkspaceId[] = ["personal"];
  if (teaches) out.push("teaching");
  if (admins) out.push("admin");
  return out;
}
