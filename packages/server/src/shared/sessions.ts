import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";
import type { User } from "./accounts.js";

// Researcher sessions (the `sessions` table): a random key in an
// httpOnly cookie, its hash in the database. Sliding: each use pushes the
// expiry out again, at most once an hour. A session remembers whether its
// login used a second factor (`mfa`) and when the provider authenticated
// the user (`authTime`): sensitive actions need that recent, and with a
// second factor unless `AUTH_INSECURE_DISABLE_2FA` (step-up, researcher/auth.ts).

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
export async function createSession(db: Db, userId: number, login: SessionLogin): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId,
    keyHash: hashKey(key),
    expires: new Date(Date.now() + SESSION_TTL_MS),
    mfa: login.mfa,
    authTime: login.authTime,
    issuer: login.issuer,
  });
  return key;
}

/** The user of a valid session key (not blocked), with the session's second factor; extends the session. */
export async function userForSession(db: Db, key: string): Promise<(User & SessionLogin & { sessionId: number }) | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: accountRole(users.id),
      sessionId: sessions.id,
      expires: sessions.expires,
      mfa: sessions.mfa,
      authTime: sessions.authTime,
      issuer: sessions.issuer,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.keyHash, hashKey(key)), gt(sessions.expires, sql`now()`), isNull(users.blockedAt)));
  if (!row) return null;
  const { expires: current, ...user } = row;
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  if (expires.getTime() - current.getTime() > EXTEND_AFTER_MS) {
    await db.update(sessions).set({ expires }).where(eq(sessions.id, row.sessionId));
  }
  return user;
}

export async function deleteSession(db: Db, key: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.keyHash, hashKey(key)));
}
