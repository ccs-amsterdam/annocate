import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccountRole, ApiKeyCreated, ApiKeyResponse, Limits, ServerSettings } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { apiKeys, domainPlans, identities, plans, roles, serverSettings, sessions, studies, units, users } from "../db/schema/index.js";
import { accountRole } from "../db/sql.js";

// Users, their identities and roles, limits, and API keys (contracts
// account.ts, docs/accounts.md). A user is who logs in with an identity (the
// provider's `iss` + `sub`); the email address, from the latest login, is
// how people find each other. Roles are rows in `roles`, given to a user or
// to users with an email domain; `accountRole()` and `studyRole()`
// (db/sql.ts) apply them with the standard's safeguards.

export interface User {
  id: number;
  email: string;
  role: AccountRole;
}

const KEY_PREFIX = "atk_";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function toApiKeyResponse(row: typeof apiKeys.$inferSelect): ApiKeyResponse {
  return { id: row.id, label: row.label, prefix: row.prefix, created: row.created, lastUsed: row.lastUsed, revokedAt: row.revokedAt };
}

/** A user's id, email and account role, to select. */
const userFields = { id: users.id, email: users.email, role: accountRole(users.id) };

/** Registered users first, then the most recently active. */
const mostRecentlyActive = [sql`${users.lastLoginAt} DESC NULLS LAST`, desc(users.id)];

/**
 * A registered user with this email, made if there is none (development
 * headers, the operator's command line, tests): the most recently active
 * one, else a shadow user made registered. Its address counts as verified
 * (these come from the operator, not a provider). Logins use `loginUser`.
 */
export async function ensureUser(db: Db, email: string): Promise<User> {
  const address = email.trim().toLowerCase();
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, address), isNotNull(users.registeredAt)))
    .orderBy(...mostRecentlyActive)
    .limit(1);
  const [claimed] = found
    ? [found]
    : await db
        .update(users)
        .set({ registeredAt: sql`now()`, emailVerified: true })
        .where(and(eq(users.email, address), isNull(users.registeredAt)))
        .returning({ id: users.id });
  const [made] = claimed ? [claimed] : await db.insert(users).values({ email: address, registeredAt: sql`now()`, emailVerified: true }).returning({ id: users.id });
  return (await userById(db, made!.id))!;
}

/** A user with their account role. */
async function userById(db: Db, id: number): Promise<User | null> {
  const [user] = await db.select(userFields).from(users).where(eq(users.id, id));
  return user ?? null;
}

/**
 * Who an email address is, to give them a role (study users, invitations):
 * the most recently active registered user with it, else its shadow user,
 * made if there is none (JIT account claiming: its owner's first login
 * claims it, docs/accounts.md).
 */
export async function userForEmail(db: Db, email: string): Promise<{ id: number; registered: boolean }> {
  const address = email.trim().toLowerCase();
  const registered = sql<boolean>`${users.registeredAt} IS NOT NULL`;
  const [found] = await db
    .select({ id: users.id, registered })
    .from(users)
    .where(eq(users.email, address))
    .orderBy(desc(registered), ...mostRecentlyActive)
    .limit(1);
  if (found) return found;
  const [made] = await db
    .insert(users)
    .values({ email: address })
    .onConflictDoUpdate({ target: users.email, targetWhere: isNull(users.registeredAt), set: { email: sql`excluded.email` } })
    .returning({ id: users.id });
  return { id: made!.id, registered: false };
}

/** The conflict target of a user's server role (the partial unique index roles_user_server). */
const userServerRole = {
  target: roles.userId,
  targetWhere: and(isNull(roles.studyId), isNotNull(roles.userId), isNull(roles.emailDomain)),
};

/** Gives a user an account role on the server (`user`: none of their own); `granted_at` stays for an unchanged role. */
export async function setServerRole(db: Db, userId: number, role: AccountRole, grantedBy: string | null = null): Promise<void> {
  if (role === "user") {
    await db.delete(roles).where(and(isNull(roles.studyId), eq(roles.userId, userId), isNull(roles.emailDomain)));
    return;
  }
  await db
    .insert(roles)
    .values({ role, userId, grantedBy })
    .onConflictDoUpdate({
      ...userServerRole,
      set: {
        role: sql`excluded.role`,
        grantedBy: sql`excluded.granted_by`,
        grantedAt: sql`CASE WHEN ${roles.role} = excluded.role THEN ${roles.grantedAt} ELSE now() END`,
      },
    });
}

/** A login, as the provider says (oidc.ts). */
export interface LoginIdentity {
  iss: string;
  sub: string;
  email: string;
  /** The provider confirmed the address (`email_verified: true`). */
  emailVerified: boolean;
  mfa: boolean;
}

/**
 * The user who logs in (the lab's Authentication standard, "IBAC"): the
 * identity's user, with the email updated from the provider; else, for a
 * new identity, the shadow user of its verified email (JIT account
 * claiming), else a new user. An existing user also claims a shadow user of
 * their (new) email: its roles and plan move to them. Records the login
 * (`email_verified`, `has_mfa`, `last_login_at`, `reactivated_at` after a year away: a year
 * without logging in makes a user dormant). `admins` (`ANNOTINDER_ADMINS`)
 * get the admin role.
 */
export async function loginUser(db: Db, login: LoginIdentity, admins: readonly string[]): Promise<User> {
  const email = login.email.trim().toLowerCase();
  const identity = and(eq(identities.iss, login.iss), eq(identities.sub, login.sub));
  return db.transaction(async (tx) => {
    const [known] = await tx.select({ userId: identities.userId }).from(identities).where(identity);
    let userId = known?.userId;
    if (userId === undefined) {
      const [shadow] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.registeredAt)));
      userId = shadow?.id ?? (await tx.insert(users).values({ email }).returning({ id: users.id }))[0]!.id;
      await tx.insert(identities).values({ iss: login.iss, sub: login.sub, userId });
    } else {
      await claimShadowUser(tx, userId, email);
    }
    await tx
      .update(users)
      .set({
        email,
        emailVerified: login.emailVerified,
        hasMfa: login.mfa,
        registeredAt: sql`COALESCE(${users.registeredAt}, now())`,
        reactivatedAt: sql`CASE WHEN ${users.lastLoginAt} < now() - interval '1 year' THEN now() ELSE ${users.reactivatedAt} END`,
        lastLoginAt: sql`now()`,
      })
      .where(eq(users.id, userId));
    await tx.update(identities).set({ lastLoginAt: sql`now()` }).where(identity);
    if (admins.includes(email)) await setServerRole(tx, userId, "admin", "ANNOTINDER_ADMINS");
    return (await userById(tx, userId))!;
  });
}

/** A shadow user with this email, other than `userId`, is claimed by it: its roles (and plan, if they have none) move over. */
async function claimShadowUser(db: Db, userId: number, email: string): Promise<void> {
  const [shadow] = await db
    .select({ id: users.id, planId: users.planId })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.registeredAt), ne(users.id, userId)));
  if (!shadow) return;
  // An invitation unclaimed for 3 months is expired (docs/accounts.md "Safeguards"): its roles don't move
  await db.delete(roles).where(and(eq(roles.userId, shadow.id), lt(roles.grantedAt, sql`now() - interval '3 months'`)));
  // Roles the user already has in the same place win over the invitation's
  const own = alias(roles, "own");
  await db.delete(roles).where(
    and(
      eq(roles.userId, shadow.id),
      exists(
        db
          .select({ one: sql`1` })
          .from(own)
          .where(
            and(
              eq(own.userId, userId),
              sql`${own.studyId} IS NOT DISTINCT FROM ${roles.studyId}`,
              sql`${own.emailDomain} IS NOT DISTINCT FROM ${roles.emailDomain}`,
            ),
          ),
      ),
    ),
  );
  await db.update(roles).set({ userId }).where(eq(roles.userId, shadow.id));
  await db
    .update(users)
    .set({ planId: sql`COALESCE(${users.planId}, ${shadow.planId})` })
    .where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, shadow.id));
}

/**
 * JIT re-claiming after changing login providers without account linking
 * (docs/accounts.md "Changing providers"): forgets every login identity and
 * ends all sessions; registered users become shadow users, claimed by the
 * next login with their (verified) email address. Their own roles count
 * from now, so the 3 months to claim them start now. Of users sharing an
 * email address, only the one who logged in last can be claimed.
 */
export async function resetIdentities(db: Db): Promise<{ users: number; unclaimable: number }> {
  return db.transaction(async (tx) => {
    await tx.delete(identities);
    await tx.delete(sessions);
    const registered = tx.select({ id: users.id }).from(users).where(isNotNull(users.registeredAt));
    await tx.update(roles).set({ grantedAt: sql`now()` }).where(inArray(roles.userId, registered));
    // Users sharing the email who win over this one: a shadow user, or a later login
    const other = alias(users, "other");
    const reset = await tx
      .update(users)
      .set({ registeredAt: null })
      .where(
        and(
          isNotNull(users.registeredAt),
          sql`NOT EXISTS (${tx
            .select({ one: sql`1` })
            .from(other)
            .where(
              and(
                eq(other.email, users.email),
                ne(other.id, users.id),
                or(
                  isNull(other.registeredAt),
                  gt(other.lastLoginAt, users.lastLoginAt),
                  and(sql`${other.lastLoginAt} IS NOT DISTINCT FROM ${users.lastLoginAt}`, gt(other.id, users.id)),
                ),
              ),
            )})`,
        ),
      )
      .returning({ id: users.id });
    const left = await tx.$count(users, isNotNull(users.registeredAt));
    return { users: reset.length, unclaimable: left };
  });
}

/**
 * A new key for a user: returned this once, stored as a hash. Made only in
 * a web session with a recent second factor (or by the server's operator),
 * and never allowed sensitive actions (researcher/auth.ts).
 */
export async function createApiKey(db: Db, userId: number, label: string): Promise<ApiKeyCreated> {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, label, keyHash: hashKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) })
    .returning();
  return { ...toApiKeyResponse(row!), key };
}

export async function listApiKeys(db: Db, userId: number): Promise<ApiKeyResponse[]> {
  return (await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(asc(apiKeys.id))).map(toApiKeyResponse);
}

/** Revokes one of the user's keys; null if they have no such key. */
export async function revokeApiKey(db: Db, userId: number, id: number): Promise<ApiKeyResponse | null> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: sql`COALESCE(${apiKeys.revokedAt}, now())` })
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
    .returning();
  return row ? toApiKeyResponse(row) : null;
}

/** The user an API key belongs to, if the key is valid (and not revoked) and the user isn't blocked. Records its use. */
export async function userForKey(db: Db, key: string): Promise<User | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [row] = await db
    .update(apiKeys)
    .set({ lastUsed: sql`now()` })
    .from(users)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt), eq(users.id, apiKeys.userId), isNull(users.blockedAt)))
    .returning(userFields);
  return row ?? null;
}

// ---- registration ------------------------------------------------------------

/** Whether an email address is at a domain rule's domain (`uni.nl`, or `*.uni.nl` for subdomains too). */
function emailAtDomain(email: string, domain: string): boolean {
  const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (domain.startsWith("*.")) {
    const base = domain.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === domain;
}

/** The role row that makes every user a researcher (`registration.open`). */
export const everyoneResearcher = and(isNull(roles.studyId), isNull(roles.userId), isNull(roles.emailDomain), eq(roles.role, "researcher"));

/**
 * The server's settings (one row; made with the defaults if it isn't there).
 * `registration.open` is the role row that makes every user a researcher.
 */
export async function getSettings(db: Db): Promise<ServerSettings> {
  await db.insert(serverSettings).values({}).onConflictDoNothing();
  const [row] = await db
    .select({
      settings: serverSettings,
      open: sql<boolean>`EXISTS (${db.select({ one: sql`1` }).from(roles).where(everyoneResearcher)})`,
    })
    .from(serverSettings);
  const { settings, open } = row!;
  return {
    registration: { open, requests: settings.registration.requests ?? true },
    defaultPlanId: settings.defaultPlanId,
    unitBytes: settings.unitBytes,
    answerBytes: settings.answerBytes,
  };
}

// ---- limits ------------------------------------------------------------------

const LIMIT_KEYS = ["studies", "unitsPerStudy", "units", "codersPerStudy", "answersPerStudy"] as const;

/** The more generous of two limits (null: no limit). */
const generous = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.max(a, b));

/**
 * A user's limits: their own plan, else the most generous of their email
 * domains' plans, else the default plan; then their personal overrides.
 */
export async function effectiveLimits(db: Db, userId: number): Promise<Limits> {
  const [user] = await db.select({ email: users.email, planId: users.planId, limits: users.limits }).from(users).where(eq(users.id, userId));
  if (!user) return {};
  const allPlans = new Map((await db.select({ id: plans.id, limits: plans.limits }).from(plans)).map((p) => [p.id, p.limits]));
  let base: Limits | undefined = user.planId !== null ? allPlans.get(user.planId) : undefined;
  if (!base) {
    const rules = await db.select().from(domainPlans);
    const matching = rules
      .filter((r) => r.planId !== null && emailAtDomain(user.email, r.domain) && allPlans.has(r.planId))
      .map((r) => allPlans.get(r.planId!)!);
    if (matching.length > 0) {
      base = {};
      for (const key of LIMIT_KEYS) base[key] = matching.map((p) => p[key] ?? null).reduce((a, b) => generous(a, b));
    }
  }
  if (!base) {
    const { defaultPlanId } = await getSettings(db);
    base = defaultPlanId !== null ? (allPlans.get(defaultPlanId) ?? {}) : {};
  }
  const limits: Limits = {};
  for (const key of LIMIT_KEYS) {
    const own = user.limits[key];
    limits[key] = own !== undefined ? own : (base[key] ?? null);
  }
  return limits;
}

/** What a user's owned studies hold. */
export async function usage(db: Db, userId: number): Promise<{ studies: number; units: number }> {
  const [owned] = await db.select({ n: count() }).from(studies).where(eq(studies.ownerId, userId));
  const [draftUnits] = await db
    .select({ n: count() })
    .from(units)
    .innerJoin(studies, eq(studies.id, units.studyId))
    .where(and(eq(studies.ownerId, userId), eq(units.inDraft, true)));
  return { studies: owned!.n, units: draftUnits!.n };
}
