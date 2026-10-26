import { createHash, randomBytes } from "node:crypto";
import type { ApiKeyCreated, ApiKeyResponse } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";

// Researchers (users) and their API keys (contracts account.ts).

export interface User {
  id: number;
  email: string;
}

interface ApiKeyRow {
  id: number;
  user_id: number;
  label: string;
  prefix: string;
  created: Date;
  last_used: Date | null;
  revoked_at: Date | null;
}

const KEY_PREFIX = "atk_";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function toApiKeyResponse(row: ApiKeyRow): ApiKeyResponse {
  return { id: row.id, label: row.label, prefix: row.prefix, created: row.created, lastUsed: row.last_used, revokedAt: row.revoked_at };
}

/** The user with this email, created if there is none. Emails are compared lowercased. */
export async function ensureUser(sql: Sql, email: string): Promise<User> {
  const row = await one<User>(
    sql,
    `INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = excluded.email RETURNING id, email`,
    [email.trim().toLowerCase()],
  );
  return row!;
}

/** A new key for a user: returned this once, stored as a hash. */
export async function createApiKey(sql: Sql, userId: number, label: string): Promise<ApiKeyCreated> {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  const row = await one<ApiKeyRow>(
    sql,
    "INSERT INTO api_keys (user_id, label, key_hash, prefix) VALUES ($1, $2, $3, $4) RETURNING *",
    [userId, label, hashKey(key), key.slice(0, KEY_PREFIX.length + 6)],
  );
  return { ...toApiKeyResponse(row!), key };
}

export async function listApiKeys(sql: Sql, userId: number): Promise<ApiKeyResponse[]> {
  return (await sql.query<ApiKeyRow>("SELECT * FROM api_keys WHERE user_id = $1 ORDER BY id", [userId])).map(toApiKeyResponse);
}

/** Revokes one of the user's keys; null if they have no such key. */
export async function revokeApiKey(sql: Sql, userId: number, id: number): Promise<ApiKeyResponse | null> {
  const row = await one<ApiKeyRow>(
    sql,
    "UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND id = $2 RETURNING *",
    [userId, id],
  );
  return row ? toApiKeyResponse(row) : null;
}

/** The user an API key belongs to, if the key is valid (and not revoked). Records its use. */
export async function userForKey(sql: Sql, key: string): Promise<User | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = await one<User>(
    sql,
    `UPDATE api_keys k SET last_used = now() FROM users u
     WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND u.id = k.user_id
     RETURNING u.id, u.email`,
    [hashKey(key)],
  );
  return row ?? null;
}
