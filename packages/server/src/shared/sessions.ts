import { and, eq, gt, isNull, not, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";
import type { User } from "./accounts.js";
import { randomToken, sha256Hex } from "./crypto.js";

// Login sessions (the `sessions` table): a random key in an httpOnly
// cookie, its hash in the database (docs/security.md "The session"). A
// session ends after `sessionIdle` seconds without activity, and
// `sessionMax` seconds after the login. Activity is a request that changes
// something, or the client reporting that the user types or clicks
// (`POST /api/auth/activity`): background requests (the client refreshing
// a page) don't keep a session. The time of the last activity is written
// at most once a minute. A session remembers whether its login used a
// second factor (`mfa`), when the provider authenticated the user
// (`authTime`) and the last sensitive action (`stepUpAt`): step-up,
// researcher/auth.ts.

/** How long logins and step-ups last, in seconds (config.ts has the settings). */
export interface LoginLimits {
  /** Without activity, before the user logs in again (`AUTH_SESSION_IDLE`). */
  sessionIdle: number;
  /** In total, before the user logs in again (`AUTH_SESSION_MAX`). */
  sessionMax: number;
  /** How old the login with a second factor may be for sensitive actions (`AUTH_STEP_UP_MAX_AGE`). */
  stepUpMaxAge: number;
  /** How long after that login, or the last sensitive action, the next one may come (`AUTH_STEP_UP_IDLE`). */
  stepUpIdle: number;
}

export const DEFAULT_LOGIN_LIMITS: LoginLimits = {
  sessionIdle: 30 * 60,
  sessionMax: 24 * 60 * 60,
  stepUpMaxAge: 60 * 60,
  stepUpIdle: 15 * 60,
};

/** Activity is written again once the last write is this old. */
const ACTIVITY_WRITE_EVERY = sql`interval '1 minute'`;

/** Requests that only read (GET, HEAD) aren't activity: the client refreshes pages in the background. */
export const isActivity = (method: string) => method !== "GET" && method !== "HEAD";

export interface SessionLogin {
  /** The login used a second factor (`OIDC_MFA_CLAIM`). */
  mfa: boolean;
  /** When the provider authenticated the user (`auth_time`); null if it didn't say. */
  authTime: Date | null;
  /** The provider's issuer. */
  issuer: string;
}

/** A new session for a user; returns the key for the cookie. `idToken`: the login's, to end the provider's session at logout. */
export async function createSession(
  db: Db,
  userId: number,
  login: SessionLogin,
  idToken: string | null = null,
): Promise<string> {
  const key = randomToken();
  await db.insert(sessions).values({
    userId,
    keyHash: sha256Hex(key),
    mfa: login.mfa,
    authTime: login.authTime,
    issuer: login.issuer,
    idToken: idToken || null,
  });
  return key;
}

/** The sessions that haven't ended. */
const live = ({ sessionIdle, sessionMax }: LoginLimits) =>
  and(
    gt(sessions.lastActive, sql`now() - make_interval(secs => ${sessionIdle})`),
    gt(sessions.created, sql`now() - make_interval(secs => ${sessionMax})`),
  );

/**
 * The user of a live session key (not blocked), with the session's login
 * and last sensitive action. `active`: the request is the user's activity,
 * which keeps the session.
 */
export async function userForSession(
  db: Db,
  key: string,
  limits: LoginLimits,
  { active }: { active: boolean },
): Promise<(User & SessionLogin & { sessionId: number; stepUpAt: Date | null }) | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: accountRole(users.id),
      sessionId: sessions.id,
      mfa: sessions.mfa,
      authTime: sessions.authTime,
      stepUpAt: sessions.stepUpAt,
      issuer: sessions.issuer,
      written: sql<boolean>`${sessions.lastActive} > now() - ${ACTIVITY_WRITE_EVERY}`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.keyHash, sha256Hex(key)), live(limits), isNull(users.blockedAt)));
  if (!row) return null;
  const { written, ...user } = row;
  if (active && !written)
    await db
      .update(sessions)
      .set({ lastActive: sql`now()` })
      .where(eq(sessions.id, row.sessionId));
  return user;
}

/** A sensitive action now: the step-up's idle time starts again (researcher/auth.ts). */
export async function recordStepUp(db: Db, sessionId: number): Promise<void> {
  await db.update(sessions).set({ stepUpAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Ends a session; returns its provider and ID token (null without one), or null if there was no such session. */
export async function deleteSession(db: Db, key: string): Promise<{ issuer: string; idToken: string | null } | null> {
  const [ended] = await db
    .delete(sessions)
    .where(eq(sessions.keyHash, sha256Hex(key)))
    .returning({ issuer: sessions.issuer, idToken: sessions.idToken });
  return ended ?? null;
}

/** Removes the sessions that have ended: at each login, and every hour (`sweepExpiredSessions`). */
export async function deleteExpiredSessions(db: Db, limits: LoginLimits): Promise<void> {
  await db.delete(sessions).where(not(live(limits)!));
}

const SWEEP_EVERY_MS = 60 * 60_000;

/**
 * Removes ended sessions every hour, so their records don't wait for the
 * next login. Returns how to stop.
 */
export function sweepExpiredSessions(db: Db, limits: LoginLimits, everyMs = SWEEP_EVERY_MS): () => void {
  const sweep = () =>
    void deleteExpiredSessions(db, limits).catch((error) => console.error("Sweeping sessions failed", error));
  const timer = setInterval(sweep, everyMs);
  return () => clearInterval(timer);
}
