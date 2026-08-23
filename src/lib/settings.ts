import { db, nowISO } from "./db";
import { decryptSecret, encryptSecret, hintFor } from "./crypto";
import { PROVIDER_MAP } from "./ai/catalog";
import { envConfig } from "./ai";
import type { AIConfig } from "./ai/types";

export type AISettingsRow = {
  userId: string;
  aiProvider: string | null;
  aiModel: string | null;
  apiKeyCipher: string | null;
  apiKeyHint: string | null;
  updatedAt: string;
};

/** What the client is allowed to see — never the key itself. */
export type AISettingsDTO = {
  provider: string;
  model: string | null;
  hasKey: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  /** True when nothing is saved and the server .env is providing the config. */
  usingEnvFallback: boolean;
  envProvider: string | null;
};

export async function readSettingsRow(userId: string): Promise<AISettingsRow | null> {
  return ((await db.prepare(`SELECT * FROM user_settings WHERE userId = ?`).get(userId)) as AISettingsRow) ?? null;
}

export async function getAISettings(userId: string): Promise<AISettingsDTO> {
  const row = await readSettingsRow(userId);
  const env = envConfig();

  if (!row?.aiProvider) {
    return {
      provider: env.provider,
      model: env.model,
      hasKey: Boolean(env.apiKey),
      keyHint: env.apiKey ? hintFor(env.apiKey) : null,
      updatedAt: null,
      usingEnvFallback: true,
      envProvider: env.provider,
    };
  }

  return {
    provider: row.aiProvider,
    model: row.aiModel,
    hasKey: Boolean(row.apiKeyCipher),
    keyHint: row.apiKeyHint,
    updatedAt: row.updatedAt,
    usingEnvFallback: false,
    envProvider: env.provider,
  };
}

export type SaveAIInput = {
  provider: string;
  model?: string | null;
  /** undefined = leave the stored key alone; null = clear it; string = replace it. */
  apiKey?: string | null;
};

export async function saveAISettings(userId: string, input: SaveAIInput): Promise<AISettingsDTO> {
  const existing = await readSettingsRow(userId);

  let cipher = existing?.apiKeyCipher ?? null;
  let hint = existing?.apiKeyHint ?? null;

  if (input.apiKey === null) {
    cipher = null;
    hint = null;
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    cipher = encryptSecret(input.apiKey.trim());
    hint = hintFor(input.apiKey);
  }

  // Switching provider invalidates a key belonging to the previous one.
  if (existing?.aiProvider && existing.aiProvider !== input.provider && input.apiKey === undefined) {
    cipher = null;
    hint = null;
  }

  await db.prepare(
    `INSERT INTO user_settings (userId, aiProvider, aiModel, apiKeyCipher, apiKeyHint, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       aiProvider = excluded.aiProvider,
       aiModel = excluded.aiModel,
       apiKeyCipher = excluded.apiKeyCipher,
       apiKeyHint = excluded.apiKeyHint,
       updatedAt = excluded.updatedAt`
  ).run(userId, input.provider, input.model?.trim() || null, cipher, hint, nowISO());

  return getAISettings(userId);
}

/** Remove only the key, keeping the chosen provider and model. */
export async function deleteAPIKey(userId: string): Promise<AISettingsDTO> {
  await db.prepare(
    `UPDATE user_settings SET apiKeyCipher = NULL, apiKeyHint = NULL, updatedAt = ? WHERE userId = ?`
  ).run(nowISO(), userId);
  return getAISettings(userId);
}

/** Reset everything back to whatever the server .env provides. */
export async function resetAISettings(userId: string): Promise<AISettingsDTO> {
  await db.prepare(`DELETE FROM user_settings WHERE userId = ?`).run(userId);
  return getAISettings(userId);
}

/** The config actually used to parse: user settings first, then .env. */
export async function resolveAIConfig(userId: string): Promise<AIConfig> {
  const row = await readSettingsRow(userId);
  if (!row?.aiProvider) return envConfig();

  const info = PROVIDER_MAP[row.aiProvider];
  const key = row.apiKeyCipher ? decryptSecret(row.apiKeyCipher) : null;

  // Chose a key-requiring provider but never saved a key — fall back rather than error.
  if (info?.needsKey && !key) return envConfig();

  return {
    provider: row.aiProvider,
    apiKey: key,
    model: row.aiModel,
    origin: "user",
  };
}
