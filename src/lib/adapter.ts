import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import { db, newId } from "./db";

/**
 * Auth.js adapter over Postgres. Handles OAuth account linking and (if you
 * switch to database sessions) session storage.
 */

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: string | null;
  image: string | null;
};

function toUser(row: UserRow | undefined): AdapterUser | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email as string,
    emailVerified: row.emailVerified ? new Date(row.emailVerified) : null,
    image: row.image,
  };
}

const USER_COLS = "id, name, email, emailVerified, image";

export function PostgresAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = (user as any).id || newId();
      await db.prepare(
        `INSERT INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, ?, ?)`
      ).run(
        id,
        user.name ?? null,
        user.email?.toLowerCase() ?? null,
        user.emailVerified ? user.emailVerified.toISOString() : null,
        user.image ?? null
      );
      return { ...user, id } as AdapterUser;
    },

    async getUser(id) {
      return toUser((await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id)) as UserRow);
    },

    async getUserByEmail(email) {
      return toUser(
        (await db.prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`).get(email.toLowerCase())) as UserRow
      );
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const row = (await db
        .prepare(
          `SELECT u.id, u.name, u.email, u.emailVerified, u.image
             FROM users u
             JOIN accounts a ON a.userId = u.id
            WHERE a.provider = ? AND a.providerAccountId = ?`
        )
        .get(provider, providerAccountId)) as UserRow | undefined;
      return toUser(row);
    },

    async updateUser(user) {
      const existing = (await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(user.id)) as UserRow;
      if (!existing) throw new Error("User not found");

      await db.prepare(
        `UPDATE users SET name = ?, email = ?, emailVerified = ?, image = ? WHERE id = ?`
      ).run(
        user.name ?? existing.name,
        (user.email ?? existing.email)?.toLowerCase() ?? null,
        user.emailVerified ? user.emailVerified.toISOString() : existing.emailVerified,
        user.image ?? existing.image,
        user.id
      );

      return toUser((await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(user.id)) as UserRow)!;
    },

    async deleteUser(id) {
      await db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    },

    async linkAccount(account) {
      // SQLite's "INSERT OR REPLACE" -> Postgres's ON CONFLICT ... DO UPDATE,
      // replacing every column except the conflict target itself.
      await db.prepare(
        `INSERT INTO accounts
           (id, userId, type, provider, providerAccountId, refresh_token, access_token,
            expires_at, token_type, scope, id_token, session_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (provider, providerAccountId) DO UPDATE SET
           id = excluded.id,
           userId = excluded.userId,
           type = excluded.type,
           refresh_token = excluded.refresh_token,
           access_token = excluded.access_token,
           expires_at = excluded.expires_at,
           token_type = excluded.token_type,
           scope = excluded.scope,
           id_token = excluded.id_token,
           session_state = excluded.session_state`
      ).run(
        newId(),
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.token_type ?? null,
        account.scope ?? null,
        account.id_token ?? null,
        (account as any).session_state ?? null
      );
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await db.prepare(`DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?`).run(
        provider,
        providerAccountId
      );
    },

    async createSession(session) {
      await db.prepare(
        `INSERT INTO sessions (id, sessionToken, userId, expires) VALUES (?, ?, ?, ?)`
      ).run(newId(), session.sessionToken, session.userId, session.expires.toISOString());
      return session as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const s = (await db
        .prepare(`SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?`)
        .get(sessionToken)) as { sessionToken: string; userId: string; expires: string } | undefined;
      if (!s) return null;

      const user = toUser((await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(s.userId)) as UserRow);
      if (!user) return null;

      return {
        session: { sessionToken: s.sessionToken, userId: s.userId, expires: new Date(s.expires) },
        user,
      };
    },

    async updateSession(session) {
      const existing = (await db
        .prepare(`SELECT sessionToken, userId, expires FROM sessions WHERE sessionToken = ?`)
        .get(session.sessionToken)) as { sessionToken: string; userId: string; expires: string } | undefined;
      if (!existing) return null;

      const expires = session.expires ? session.expires.toISOString() : existing.expires;
      await db.prepare(`UPDATE sessions SET expires = ?, userId = ? WHERE sessionToken = ?`).run(
        expires,
        session.userId ?? existing.userId,
        session.sessionToken
      );

      return {
        sessionToken: session.sessionToken,
        userId: session.userId ?? existing.userId,
        expires: new Date(expires),
      };
    },

    async deleteSession(sessionToken) {
      await db.prepare(`DELETE FROM sessions WHERE sessionToken = ?`).run(sessionToken);
    },

    async createVerificationToken(token) {
      await db.prepare(
        `INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)`
      ).run(token.identifier, token.token, token.expires.toISOString());
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const row = (await db
        .prepare(`SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ?`)
        .get(identifier, token)) as { identifier: string; token: string; expires: string } | undefined;
      if (!row) return null;

      await db.prepare(`DELETE FROM verification_tokens WHERE identifier = ? AND token = ?`).run(identifier, token);
      return { identifier: row.identifier, token: row.token, expires: new Date(row.expires) };
    },
  };
}
