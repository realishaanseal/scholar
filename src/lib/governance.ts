import { db, newId } from "@/lib/db";
import { RateLimited } from "@/lib/api/errors";

export { RateLimited };

/**
 * The audit log, and the rate limiter.
 *
 * Both are infrastructure an institution needs before it can put this in front
 * of real students, and both are deliberately unglamorous.
 */

/* ── Audit log ─────────────────────────────────────────────────────────── */

export type AuditAction =
  | "authz:denied"
  | "assignment:publish"
  | "assignment:delete"
  | "submission:grade"
  | "file:download"
  | "file:delete"
  | "member:add"
  | "member:suspend"
  | "quiz:publish";

/**
 * Record something consequential.
 *
 * Never throws. An audit write that failed must not take down the request it
 * was describing — a teacher whose mark was saved should not see an error
 * because the log was briefly unavailable, and a failed write here is a
 * monitoring problem rather than a user's problem. The trade is stated
 * plainly because it is a real one: this log is best-effort, and an
 * institution relying on it for a legal answer should know that.
 */
export async function audit(input: {
  organizationId: string;
  actorUserId: string | null;
  actorLabel?: string;
  action: AuditAction;
  subjectType?: string;
  subjectId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log
           (id, organization_id, actor_user_id, actor_label, action,
            subject_type, subject_id, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)`
      )
      .run(
        newId(),
        input.organizationId,
        input.actorUserId,
        input.actorLabel ?? "",
        input.action,
        input.subjectType ?? "",
        input.subjectId ?? null,
        JSON.stringify(clip(input.detail ?? {}))
      );
  } catch (err) {
    console.error("[audit] could not record", input.action, (err as Error).message);
  }
}

export type AuditEntry = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

/** Recent activity in one institution, newest first. */
export async function recentAudit(
  organizationId: string,
  limit = 100
): Promise<AuditEntry[]> {
  const rows = await db
    .prepare(
      `SELECT id, actor_user_id, actor_label, action, subject_type, subject_id,
              detail, created_at
         FROM audit_log
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(organizationId, Math.min(500, Math.max(1, limit)));

  return (rows as any[]).map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id ?? null,
    actorLabel: r.actor_label ?? "",
    action: r.action,
    subjectType: r.subject_type ?? "",
    subjectId: r.subject_id ?? null,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/**
 * Keep a detail object small and free of anything it should not hold.
 *
 * An audit entry describes an action; it is not a copy of the thing acted on.
 * Without this, "record the grade change" becomes "keep a second copy of every
 * piece of feedback in a table nobody thinks of as holding student work".
 */
function clip(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(detail)) {
    if (n++ >= 12) break;
    out[k] =
      typeof v === "string" ? v.slice(0, 200)
      : typeof v === "number" || typeof v === "boolean" || v === null ? v
      : String(v).slice(0, 200);
  }
  return out;
}

/* ── Rate limiting ─────────────────────────────────────────────────────── */

export type RateVerdict = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetIn: number;
};

/**
 * A fixed-window counter, in the database.
 *
 * One statement, so two simultaneous requests cannot both read a stale count
 * and both decide they are under the limit: the increment and the read are the
 * same operation, and Postgres serialises them on the row.
 *
 * Fails OPEN. If the limiter itself is broken, the choice is between refusing
 * everyone and admitting more traffic than intended, and refusing every
 * teacher in a school because a counter table is unavailable is the worse
 * outcome. Stated here rather than discovered later.
 */
export async function rateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<RateVerdict> {
  const key = `${bucket}:${subject}`;

  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, window_start)
              VALUES (?, 1, now())
         ON CONFLICT (key) DO UPDATE
            SET count = CASE
                  WHEN rate_limits.window_start < now() - make_interval(secs => ?)
                  THEN 1
                  ELSE rate_limits.count + 1
                END,
                window_start = CASE
                  WHEN rate_limits.window_start < now() - make_interval(secs => ?)
                  THEN now()
                  ELSE rate_limits.window_start
                END
         RETURNING count,
                   EXTRACT(EPOCH FROM (window_start + make_interval(secs => ?) - now()))::int AS reset_in`
      )
      .get(key, windowSeconds, windowSeconds, windowSeconds);

    const count = Number((row as any)?.count ?? 1);
    const resetIn = Math.max(0, Number((row as any)?.reset_in ?? windowSeconds));

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn,
    };
  } catch (err) {
    console.error("[ratelimit] failing open:", (err as Error).message);
    return { allowed: true, remaining: limit, resetIn: 0 };
  }
}

/** Apply a limit, or throw. */
export async function enforceRate(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const verdict = await rateLimit(bucket, subject, limit, windowSeconds);
  if (!verdict.allowed) throw new RateLimited(verdict.resetIn);
}
