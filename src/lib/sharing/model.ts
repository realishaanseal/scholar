/**
 * The sharing model.
 *
 * Everything before this tier was single-owner: every query ended in
 * `WHERE userId = ?`, and that was the whole security model. Sharing breaks
 * that assumption, so the rules are written down here explicitly rather than
 * being implied by whichever query happens to run.
 *
 * Three principles, in priority order:
 *
 *   1. DEFAULT DENY. Nothing is visible to anyone but its owner unless a grant
 *      says otherwise. There is no "public" flag and no inherited visibility.
 *   2. SCOPES, NOT ACCOUNTS. A grant exposes one named slice of data — never
 *      "this person can see my account". A parent granted `workload-summary`
 *      cannot read a task title, however the UI is driven.
 *   3. THE STUDENT REVOKES. Every grant is revocable by its subject at any
 *      time, immediately, with no negotiation and no grace period.
 */

export type GroupKind = "study-group" | "course" | "family";

export type MemberRole =
  /** Created the group. Can rename, remove members, delete it. */
  | "owner"
  /** Full participation: post, comment, assign. */
  | "member"
  /** Teacher in a course: can distribute assignments to students. */
  | "teacher"
  /** Read-only observer (a parent). Sees only what a grant allows. */
  | "observer";

/**
 * What a share grant actually exposes.
 *
 * Kept deliberately coarse and few. Every additional scope is a new way for
 * data to escape, so a scope only exists if there's a real use for it.
 */
export type ShareScope =
  /** Counts and hours only: how much work, how much is overdue. No titles. */
  | "workload-summary"
  /** Upcoming deadlines: subject, due date, done/not — but not details or notes. */
  | "upcoming-deadlines"
  /** Completion statistics over time. No task identities at all. */
  | "progress-stats";

export const SHARE_SCOPES: Array<{ id: ShareScope; label: string; explains: string }> = [
  {
    id: "workload-summary",
    label: "Workload summary",
    explains: "How many assignments are open, due soon, or overdue — and roughly how many hours that is. No titles, no subjects, no contents.",
  },
  {
    id: "upcoming-deadlines",
    label: "Upcoming deadlines",
    explains: "Subject and due date for work due in the next two weeks, and whether it's done. Not the task details, your notes, or any attachments.",
  },
  {
    id: "progress-stats",
    label: "Progress over time",
    explains: "How often work is finished on time, and the trend over recent weeks. No individual assignments.",
  },
];

export const SCOPE_MAP = Object.fromEntries(SHARE_SCOPES.map((s) => [s.id, s])) as Record<
  ShareScope,
  (typeof SHARE_SCOPES)[number]
>;

/**
 * Things deliberately NOT offered as a scope, and why.
 *
 * Written down so a future change has to argue against the reasoning rather
 * than silently reverse it:
 *
 *   - Task details / notes: a student's working notes are where they admit
 *     they don't understand something. Surveillance of that changes what they
 *     write, which makes the notes useless and the app worse.
 *   - Live location, app usage, keystrokes, screen time: not collected at all,
 *     so not shareable. The spec asks for guardianship, not monitoring.
 *   - The AI coach conversation: it's the student talking to a tool about
 *     their own difficulties. Never shared.
 *   - Attachments: they contain third parties' material and often the
 *     student's own work in progress.
 */
export const NEVER_SHARED = [
  "Task details and personal notes",
  "Attachments and uploaded files",
  "Study coach conversations",
  "API keys and account credentials",
] as const;

export type ShareGrant = {
  id: string;
  /** Whose data this exposes. */
  subjectUserId: string;
  /** Who may read it. Null while an invite is outstanding. */
  viewerUserId: string | null;
  /** Invite code, used once to bind a viewer. */
  inviteCode: string | null;
  scopes: ShareScope[];
  label: string;
  createdAt: string;
  /** Null means no expiry, but the subject can still revoke at any time. */
  expiresAt: string | null;
  revokedAt: string | null;
};

export function isGrantActive(grant: ShareGrant, now = new Date()): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

/** Roles allowed to post/comment in a group. Observers never can. */
export function canParticipate(role: MemberRole): boolean {
  return role === "owner" || role === "member" || role === "teacher";
}

/** Roles allowed to distribute assignments to a whole course. */
export function canDistribute(role: MemberRole): boolean {
  return role === "owner" || role === "teacher";
}

/** Roles allowed to change the group itself or its membership. */
export function canAdminister(role: MemberRole): boolean {
  return role === "owner" || role === "teacher";
}
