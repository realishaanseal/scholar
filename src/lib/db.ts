import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase-backed storage.
 *
 * This is the only file that knows how the Admin SDK is initialised — the same
 * contract the original SQLite version had ("swapping the database means
 * changing only this file's `open()`"), now pointing at Firestore + Storage
 * instead of a local file.
 *
 * On Firebase App Hosting (and Cloud Functions/Cloud Run generally),
 * Application Default Credentials are wired up automatically — no key file is
 * needed there. Locally, either point GOOGLE_APPLICATION_CREDENTIALS at a
 * downloaded service-account JSON file, or paste that JSON's contents into
 * FIREBASE_SERVICE_ACCOUNT (handy for some hosting panels that don't let you
 * ship extra files).
 */

function initAdmin(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` : undefined);

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    let parsed: any;
    try {
      parsed = JSON.parse(inline);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is set but isn't valid JSON. Paste the whole service-account key file's contents."
      );
    }
    return initializeApp({ credential: cert(parsed), storageBucket });
  }

  // No explicit credential: relies on GOOGLE_APPLICATION_CREDENTIALS (local dev)
  // or Application Default Credentials (App Hosting / Cloud Run / Cloud Functions).
  return initializeApp({ storageBucket });
}

const app = initAdmin();

export const db: Firestore = getFirestore(app);
export const bucket = getStorage(app).bucket();

// The Next.js dev server hot-reloads modules but keeps `globalThis` alive; the
// Admin SDK's own getApps() guard above already prevents double-init, so
// nothing further is needed here — unlike the old better-sqlite3 connection,
// there's no file handle to leak.

export function newId(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
