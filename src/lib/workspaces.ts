/**
 * Which side of the product a person is on.
 *
 * Scholar started as one application with one navigation bar, which was right
 * when everyone using it was a student. It stopped being right the moment a
 * teacher signed in and was offered Homework and Focus — features
 * about doing coursework, shown to the person who sets it.
 *
 * So the shell now has workspaces. Each is a coherent job:
 *
 *   personal   your own work — tasks, timetable, focus, insights
 *   teaching   the classes you teach — assignments, materials, marking
 *   admin      the institution — people, courses, terms
 *
 * A workspace is offered only when the underlying relationship exists, and
 * that relationship is read from the database (see workspaces.server.ts —
 * kept apart because AppShell is a client component and importing the
 * database from it drags pg into the browser bundle) rather than from a role
 * the person claimed when they signed up. Someone who teaches two sections and
 * studies a third gets both, and can switch; someone who only teaches never
 * sees a homework tab again.
 */

export type WorkspaceId = "personal" | "teaching" | "admin";

export type WorkspaceInfo = {
  id: WorkspaceId;
  /** Key into the `shell` namespace. */
  labelKey: string;
  /** Where switching into this workspace lands. */
  home: string;
  /** Route prefixes that belong to it, used to infer the active workspace. */
  owns: string[];
};

export const WORKSPACES: Record<WorkspaceId, WorkspaceInfo> = {
  personal: {
    id: "personal",
    labelKey: "workspacePersonal",
    home: "/dashboard",
    owns: [
      "/dashboard", "/learn", "/library", "/timetable",
      "/insights", "/groups",
    ],
  },
  teaching: {
    id: "teaching",
    labelKey: "workspaceTeaching",
    home: "/teach",
    owns: ["/teach"],
  },
  admin: {
    id: "admin",
    labelKey: "workspaceAdmin",
    home: "/admin",
    owns: ["/admin"],
  },
};

/**
 * Where to land when no workspace is named.
 *
 * The most institutional one available, because that is the job someone signed
 * in to do. A head of department who also has personal tasks wants the
 * institution first; they can always switch back, and the switch is
 * remembered.
 */
export function defaultWorkspace(available: WorkspaceId[]): WorkspaceId {
  if (available.includes("admin")) return "admin";
  if (available.includes("teaching")) return "teaching";
  return "personal";
}

/**
 * Which workspace a path belongs to.
 *
 * Derived from the route rather than stored, so following a link into a class
 * puts you in Teaching without anything having to remember to set it.
 */
export function workspaceForPath(pathname: string): WorkspaceId | null {
  for (const ws of Object.values(WORKSPACES)) {
    if (ws.owns.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return ws.id;
    }
  }
  return null;
}
