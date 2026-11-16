import { createHash, randomBytes } from "node:crypto";
import { one, type Sql } from "../db.js";
import type { User } from "./accounts.js";

// Researcher sessions (the `sessions` table): a random key in an
// httpOnly cookie, its hash in the database. Sliding: each use pushes the
// expiry out again, at most once an hour. A session remembers whether its
// login used a second factor (`mfa`) and when the provider authenticated
// the user (`authTime`): sensitive actions need that recent (step-up,
// researcher/auth.ts).

export const SESSION_TTL_MS = 14 * 24 * 60 * 60_000;
const EXTEND_AFTER_MS = 60 * 60_000;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export interface SessionLogin {
  /** The login used a second factor (`OIDC_MFA_CLAIM`). */
  mfa: boolean;
  /** When the provider authenticated the user (`auth_time`); null if it didn't say. */
  authTime: Date | null;
  /** The provider's issuer. */
  issuer: string;
}

/** A new session for a user; returns the key for the cookie. */
export async function createSession(sql: Sql, userId: number, login: SessionLogin): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  await sql.query("INSERT INTO sessions (user_id, key_hash, expires, mfa, auth_time, issuer) VALUES ($1, $2, $3, $4, $5, $6)", [
    userId,
    hashKey(key),
    new Date(Date.now() + SESSION_TTL_MS),
    login.mfa,
    login.mfa ? login.authTime : null,
    login.issuer,
  ]);
  await sql.query("UPDATE users SET last_login = now() WHERE id = $1", [userId]);
  return key;
}

/** The user of a valid session key (not blocked), with the session's second factor; extends the session. */
export async function userForSession(sql: Sql, key: string): Promise<(User & SessionLogin & { sessionId: number }) | null> {
  const row = await one<User & { expires: Date; mfa: boolean; auth_time: Date | null; issuer: string; session_id: number }>(
    sql,
    `SELECT u.id, u.email, u.role, s.id AS session_id, s.expires, s.mfa, s.auth_time, s.issuer FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.key_hash = $1 AND s.expires > now() AND u.blocked_at IS NULL`,
    [hashKey(key)],
  );
  if (!row) return null;
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  if (expires.getTime() - row.expires.getTime() > EXTEND_AFTER_MS) {
    await sql.query("UPDATE sessions SET expires = $1 WHERE key_hash = $2", [expires, hashKey(key)]);
  }
  return { id: row.id, email: row.email, role: row.role, mfa: row.mfa, authTime: row.auth_time, issuer: row.issuer, sessionId: row.session_id };
}

export async function deleteSession(sql: Sql, key: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE key_hash = $1", [hashKey(key)]);
}
