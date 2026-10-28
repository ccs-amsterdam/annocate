import { createHash, randomBytes } from "node:crypto";
import { one, type Sql } from "../db.js";
import type { User } from "./accounts.js";

// Researcher sessions (migrations/0003_sessions.sql): a random key in an
// httpOnly cookie, its hash in the database. Sliding: each use pushes the
// expiry out again, at most once an hour.

export const SESSION_TTL_MS = 14 * 24 * 60 * 60_000;
const EXTEND_AFTER_MS = 60 * 60_000;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new session for a user (`mfa`: the login used a second factor); returns the key for the cookie. */
export async function createSession(sql: Sql, userId: number, mfa = false): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  await sql.query("INSERT INTO sessions (user_id, key_hash, expires, mfa) VALUES ($1, $2, $3, $4)", [
    userId,
    hashKey(key),
    new Date(Date.now() + SESSION_TTL_MS),
    mfa,
  ]);
  await sql.query("UPDATE users SET last_login = now() WHERE id = $1", [userId]);
  return key;
}

/** The user of a valid session key (not blocked), and whether the login used a second factor; extends the session. */
export async function userForSession(sql: Sql, key: string): Promise<(User & { mfa: boolean }) | null> {
  const row = await one<User & { expires: Date; mfa: boolean }>(
    sql,
    `SELECT u.id, u.email, u.role, s.expires, s.mfa FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.key_hash = $1 AND s.expires > now() AND u.blocked_at IS NULL`,
    [hashKey(key)],
  );
  if (!row) return null;
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  if (expires.getTime() - row.expires.getTime() > EXTEND_AFTER_MS) {
    await sql.query("UPDATE sessions SET expires = $1 WHERE key_hash = $2", [expires, hashKey(key)]);
  }
  return { id: row.id, email: row.email, role: row.role, mfa: row.mfa };
}

export async function deleteSession(sql: Sql, key: string): Promise<void> {
  await sql.query("DELETE FROM sessions WHERE key_hash = $1", [hashKey(key)]);
}

/** Logins as the coder API last saw them, by key hash, for `LOGIN_CACHE_MS`. */
const recentLogins = new Map<string, { user: (User & { mfa: boolean }) | null; until: number }>();
const LOGIN_CACHE_MS = 60_000;

/**
 * `userForSession` for the coder API, which needs it on every request of a
 * logged-in coder: answered from memory for a minute (so a block or logout
 * reaches coding within a minute; the researcher API always checks).
 */
export async function cachedUserForSession(sql: Sql, key: string): Promise<(User & { mfa: boolean }) | null> {
  const hash = hashKey(key);
  const now = Date.now();
  const cached = recentLogins.get(hash);
  if (cached && cached.until > now) return cached.user;
  const user = await userForSession(sql, key);
  if (recentLogins.size > 10_000) recentLogins.clear();
  recentLogins.set(hash, { user, until: now + LOGIN_CACHE_MS });
  return user;
}
