import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import { FieldValue } from "firebase-admin/firestore";
import { db, newId } from "./db";

/**
 * Auth.js adapter over Firestore. Handles OAuth account linking and (if you
 * ever switch off `session: { strategy: "jwt" }`) session storage.
 *
 * Top-level collections, mirroring the original SQLite tables:
 *   users/{uid}                          — same doc users/{uid} that queries.ts's
 *                                           findUserByEmail/createUserWithPassword use
 *   accounts/{provider}_{providerAccountId}
 *   sessions/{sessionToken}
 *   verificationTokens/{token}
 */

type UserDoc = {
  name: string | null;
  email: string | null;
  emailVerified: string | null;
  image: string | null;
};

function toUser(id: string, data: UserDoc | undefined): AdapterUser | null {
  if (!data) return null;
  return {
    id,
    name: data.name,
    email: data.email as string,
    emailVerified: data.emailVerified ? new Date(data.emailVerified) : null,
    image: data.image,
  };
}

function accountDocId(provider: string, providerAccountId: string): string {
  // Both components are opaque vendor-supplied strings that may contain `/` —
  // encode them so the composite id can never collide with a Firestore path
  // separator or produce two different pairs mapping to the same doc id.
  return `${encodeURIComponent(provider)}_${encodeURIComponent(providerAccountId)}`;
}

export function FirestoreAdapter(): Adapter {
  const users = db.collection("users");
  const accounts = db.collection("accounts");
  const sessions = db.collection("sessions");
  const verificationTokens = db.collection("verificationTokens");

  return {
    async createUser(user) {
      const id = (user as any).id || newId();
      await users.doc(id).set({
        name: user.name ?? null,
        email: user.email?.toLowerCase() ?? null,
        emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
        image: user.image ?? null,
        passwordHash: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ...user, id } as AdapterUser;
    },

    async getUser(id) {
      const snap = await users.doc(id).get();
      return toUser(id, snap.exists ? (snap.data() as UserDoc) : undefined);
    },

    async getUserByEmail(email) {
      const snap = await users.where("email", "==", email.toLowerCase()).limit(1).get();
      if (snap.empty) return null;
      const d = snap.docs[0]!;
      return toUser(d.id, d.data() as UserDoc);
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const accSnap = await accounts.doc(accountDocId(provider, providerAccountId)).get();
      if (!accSnap.exists) return null;
      const { userId } = accSnap.data() as { userId: string };

      const userSnap = await users.doc(userId).get();
      return toUser(userId, userSnap.exists ? (userSnap.data() as UserDoc) : undefined);
    },

    async updateUser(user) {
      const ref = users.doc(user.id!);
      const existingSnap = await ref.get();
      const existing = (existingSnap.data() as UserDoc | undefined) ?? { name: null, email: null, emailVerified: null, image: null };

      const next: UserDoc = {
        name: user.name ?? existing.name,
        email: (user.email ?? existing.email)?.toLowerCase() ?? null,
        emailVerified: user.emailVerified ? user.emailVerified.toISOString() : existing.emailVerified,
        image: user.image ?? existing.image,
      };
      await ref.set(next, { merge: true });

      return toUser(user.id!, next)!;
    },

    async deleteUser(id) {
      await users.doc(id).delete();
    },

    async linkAccount(account) {
      await accounts.doc(accountDocId(account.provider, account.providerAccountId)).set({
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token ?? null,
        access_token: account.access_token ?? null,
        expires_at: account.expires_at ?? null,
        token_type: account.token_type ?? null,
        scope: account.scope ?? null,
        id_token: account.id_token ?? null,
        session_state: (account as any).session_state ?? null,
      });
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await accounts.doc(accountDocId(provider, providerAccountId)).delete();
    },

    async createSession(session) {
      await sessions.doc(session.sessionToken).set({
        userId: session.userId,
        expires: session.expires.toISOString(),
      });
      return session as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const sSnap = await sessions.doc(sessionToken).get();
      if (!sSnap.exists) return null;
      const s = sSnap.data() as { userId: string; expires: string };

      const userSnap = await users.doc(s.userId).get();
      const user = toUser(s.userId, userSnap.exists ? (userSnap.data() as UserDoc) : undefined);
      if (!user) return null;

      return {
        session: { sessionToken, userId: s.userId, expires: new Date(s.expires) },
        user,
      };
    },

    async updateSession(session) {
      const ref = sessions.doc(session.sessionToken);
      const existingSnap = await ref.get();
      if (!existingSnap.exists) return null;
      const existing = existingSnap.data() as { userId: string; expires: string };

      const expires = session.expires ? session.expires.toISOString() : existing.expires;
      const userId = session.userId ?? existing.userId;
      await ref.set({ userId, expires }, { merge: true });

      return { sessionToken: session.sessionToken, userId, expires: new Date(expires) };
    },

    async deleteSession(sessionToken) {
      await sessions.doc(sessionToken).delete();
    },

    async createVerificationToken(token) {
      await verificationTokens.doc(token.token).set({
        identifier: token.identifier,
        expires: token.expires.toISOString(),
      });
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const ref = verificationTokens.doc(token);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const data = snap.data() as { identifier: string; expires: string };
      if (data.identifier !== identifier) return null;

      await ref.delete();
      return { identifier: data.identifier, token, expires: new Date(data.expires) };
    },
  };
}
