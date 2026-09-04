import { db, newId } from "@/lib/db";

/**
 * Bringing people into an institution before they have an account.
 *
 * The circle this breaks: a class cannot be enrolled until its students have
 * registered, and nobody can tell the students what to register for until the
 * class exists. An invitation is the institution's half of that, recorded
 * ahead of time and applied when the person arrives.
 *
 * Nothing here sends email — Scholar has no mail infrastructure, and a
 * half-built one that silently fails to deliver would be worse than none. An
 * administrator invites, then tells people to sign up however they already
 * tell them things. The invitation is what makes signing up land them in the
 * right place.
 */

export type InvitationRole =
  | "STUDENT"
  | "TEACHER"
  | "TEACHING_ASSISTANT"
  | "DEPARTMENT_ADMIN"
  | "INSTITUTION_ADMIN";

export type Invitation = {
  id: string;
  email: string;
  role: InvitationRole;
  courseSectionId: string | null;
  invitedBy: string | null;
  createdAt: string;
  acceptedAt: string | null;
};

/** Normalised the same way everywhere, because a capital letter must not lose someone their place. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Invite one person, or update the invitation they already have.
 *
 * Re-inviting somebody is a correction rather than a second invitation — an
 * administrator who mistyped a role should be able to fix it by inviting
 * again, and two pending invitations for one address would be accepted twice.
 */
export async function invite(input: {
  organizationId: string;
  email: string;
  role: InvitationRole;
  courseSectionId?: string | null;
  invitedBy: string;
}): Promise<Invitation> {
  const email = normalise(input.email);

  await db
    .prepare(
      `INSERT INTO invitations
         (id, organization_id, email, role, course_section_id, invited_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (organization_id, email) WHERE accepted_at IS NULL
       DO UPDATE SET role = excluded.role,
                     course_section_id = excluded.course_section_id,
                     invited_by = excluded.invited_by,
                     created_at = now()`
    )
    .run(
      newId(), input.organizationId, email, input.role,
      input.courseSectionId ?? null, input.invitedBy
    );

  const row = await db
    .prepare(
      `SELECT id, email, role, course_section_id, invited_by, created_at, accepted_at
         FROM invitations
        WHERE organization_id = ? AND email = ? AND accepted_at IS NULL`
    )
    .get(input.organizationId, email);

  return mapInvitation(row);
}

/** Everyone invited and not yet arrived. */
export async function pendingInvitations(
  organizationId: string
): Promise<Invitation[]> {
  const rows = await db
    .prepare(
      `SELECT id, email, role, course_section_id, invited_by, created_at, accepted_at
         FROM invitations
        WHERE organization_id = ? AND accepted_at IS NULL
        ORDER BY created_at DESC`
    )
    .all(organizationId);
  return (rows as any[]).map(mapInvitation);
}

export async function revokeInvitation(
  organizationId: string,
  invitationId: string
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM invitations
        WHERE id = ? AND organization_id = ? AND accepted_at IS NULL`
    )
    .run(invitationId, organizationId);
}

/**
 * Apply every invitation waiting for this address.
 *
 * Called once, at signup, after the account exists. Plural because a person
 * can legitimately be invited by two institutions — a teacher who works at two
 * schools, a student taking a course elsewhere — and arbitrarily picking one
 * would strand the other with no way to notice.
 *
 * Never throws. A signup that succeeded must not fail because a membership
 * could not be created: the person has an account either way, and an
 * administrator can re-invite. Losing the account instead would be the worse
 * outcome by a long way.
 */
export async function acceptInvitationsFor(
  userId: string,
  email: string
): Promise<number> {
  const address = normalise(email);
  let applied = 0;

  try {
    const rows = await db
      .prepare(
        `SELECT id, organization_id, role, course_section_id
           FROM invitations
          WHERE email = ? AND accepted_at IS NULL`
      )
      .all(address);

    for (const r of rows as any[]) {
      await db
        .prepare(
          `INSERT INTO organization_memberships
             (id, organization_id, user_id, role, status)
           VALUES (?, ?, ?, ?, 'active')
           ON CONFLICT DO NOTHING`
        )
        .run(newId(), r.organization_id, userId, r.role);

      // A teaching role invited against a section means they teach it; a
      // student role means they are in it. The same field, read according to
      // what the person was invited as.
      if (r.course_section_id) {
        if (r.role === "TEACHER" || r.role === "TEACHING_ASSISTANT") {
          await db
            .prepare(
              `INSERT INTO section_teachers (id, organization_id, course_section_id, user_id, role)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT DO NOTHING`
            )
            .run(newId(), r.organization_id, r.course_section_id, userId, r.role);
        } else {
          await db
            .prepare(
              `INSERT INTO enrollments
                 (id, organization_id, course_section_id, user_id, status)
               VALUES (?, ?, ?, ?, 'active')
               ON CONFLICT DO NOTHING`
            )
            .run(newId(), r.organization_id, r.course_section_id, userId);
        }
      }

      await db
        .prepare(
          `UPDATE invitations
              SET accepted_at = now(), accepted_user_id = ?
            WHERE id = ?`
        )
        .run(userId, r.id);

      applied++;
    }
  } catch (err) {
    console.error("[invitations] could not apply:", (err as Error).message);
  }

  return applied;
}

function mapInvitation(r: any): Invitation {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    courseSectionId: r.course_section_id ?? null,
    invitedBy: r.invited_by ?? null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    acceptedAt: r.accepted_at
      ? r.accepted_at instanceof Date
        ? r.accepted_at.toISOString()
        : String(r.accepted_at)
      : null,
  };
}
