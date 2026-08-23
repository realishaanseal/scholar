import { db, nowISO } from "../db";
import { DEFAULT_THEME, decodeAccent, encodeAccent, sanitizeAccent, type ThemeAccent } from "./theme";

/**
 * Server-only reads/writes for the saved accent theme — same
 * `academic_profile` row, `updatedAt`, and `ON CONFLICT` upsert pattern as
 * `getAvailability`/`setAvailability` in memory.ts and `getLanguages`/
 * `setLanguages` in language.ts.
 */

export async function getTheme(userId: string): Promise<ThemeAccent> {
  const row = (await db
    .prepare(`SELECT themeAccent FROM academic_profile WHERE userId = ?`)
    .get(userId)) as { themeAccent: string | null } | undefined;
  return decodeAccent(row?.themeAccent) ?? DEFAULT_THEME;
}

export async function setTheme(userId: string, patch: Partial<ThemeAccent>): Promise<ThemeAccent> {
  const current = await getTheme(userId);
  const next = sanitizeAccent({ ...current, ...patch });

  await db.prepare(
    `INSERT INTO academic_profile (userId, themeAccent, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       themeAccent = excluded.themeAccent,
       updatedAt   = excluded.updatedAt`
  ).run(userId, encodeAccent(next), nowISO());

  return next;
}
