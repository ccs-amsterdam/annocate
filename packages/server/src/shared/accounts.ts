import { createHash, randomBytes } from "node:crypto";
import type { AccountRole, ApiKeyCreated, ApiKeyResponse, Limits, ServerSettings } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";

// Users, their identities and roles, limits, and API keys (contracts
// account.ts, docs/accounts.md). A user is who logs in with an identity (the
// provider's `iss` + `sub`); the email address, from the latest login, is
// how people find each other. Roles are rows in `roles`, given to a user or
// to users with an email domain; `account_role()` and `study_role()` (SQL,
// migration 0005) apply them with the standard's safeguards.

export interface User {
  id: number;
  email: string;
  role: AccountRole;
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
  return {
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    created: row.created,
    lastUsed: row.last_used,
    revokedAt: row.revoked_at,
  };
}

/**
 * A registered user with this email, made if there is none (development
 * headers, the operator's command line, tests): the most recently active
 * one, else a shadow user made registered. Logins use `loginUser`.
 */
export async function ensureUser(sql: Sql, email: string): Promise<User> {
  const address = email.trim().toLowerCase();
  const found = await one<{ id: number }>(
    sql,
    "SELECT id FROM users WHERE email = $1 AND registered_at IS NOT NULL ORDER BY last_login_at DESC NULLS LAST, id DESC LIMIT 1",
    [address],
  );
  const id =
    found?.id ??
    (
      await one<{ id: number }>(
        sql,
        "UPDATE users SET registered_at = now() WHERE email = $1 AND registered_at IS NULL RETURNING id",
        [address],
      )
    )?.id ??
    (await one<{ id: number }>(sql, "INSERT INTO users (email, registered_at) VALUES ($1, now()) RETURNING id", [
      address,
    ]))!.id;
  return (await userById(sql, id))!;
}

/** A user with their account role. */
export async function userById(sql: Sql, id: number): Promise<User | null> {
  return (await one<User>(sql, "SELECT id, email, account_role(id) AS role FROM users WHERE id = $1", [id])) ?? null;
}

/**
 * Who an email address is, to give them a role (study users, invitations):
 * the most recently active registered user with it, else its shadow user,
 * made if there is none (JIT account claiming: its owner's first login
 * claims it, docs/accounts.md).
 */
export async function userForEmail(sql: Sql, email: string): Promise<{ id: number; registered: boolean }> {
  const address = email.trim().toLowerCase();
  const found = await one<{ id: number; registered: boolean }>(
    sql,
    `SELECT id, registered_at IS NOT NULL AS registered FROM users WHERE email = $1
     ORDER BY registered_at IS NOT NULL DESC, last_login_at DESC NULLS LAST, id DESC LIMIT 1`,
    [address],
  );
  if (found) return found;
  const made = await one<{ id: number }>(
    sql,
    "INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) WHERE registered_at IS NULL DO UPDATE SET email = excluded.email RETURNING id",
    [address],
  );
  return { id: made!.id, registered: false };
}

/** Gives a user an account role on the server (`user`: none of their own); `granted_at` stays for an unchanged role. */
export async function setServerRole(
  sql: Sql,
  userId: number,
  role: AccountRole,
  grantedBy: string | null = null,
): Promise<void> {
  if (role === "user") {
    await sql.query("DELETE FROM roles WHERE study_id IS NULL AND user_id = $1 AND email_domain IS NULL", [userId]);
    return;
  }
  await sql.query(
    `INSERT INTO roles (role, user_id, granted_by) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) WHERE study_id IS NULL AND user_id IS NOT NULL AND email_domain IS NULL
     DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, granted_at = CASE WHEN roles.role = excluded.role THEN roles.granted_at ELSE now() END`,
    [role, userId, grantedBy],
  );
}

/** A login, as the provider says (oidc.ts). */
export interface LoginIdentity {
  iss: string;
  sub: string;
  email: string;
  mfa: boolean;
}

/** A year without logging in makes a user dormant: their next login reactivates them (`reactivated_at`). */
const DORMANT_AFTER = "1 year";

/**
 * The user who logs in (the lab's Authentication standard, "IBAC"): the
 * identity's user, with the email updated from the provider; else, for a
 * new identity, the shadow user of its verified email (JIT account
 * claiming), else a new user. An existing user also claims a shadow user of
 * their (new) email: its roles and plan move to them. Records the login
 * (`has_mfa`, `last_login_at`, `reactivated_at` after a year away).
 * `admins` (`ANNOTINDER_ADMINS`) get the admin role.
 */
export async function loginUser(sql: Sql, login: LoginIdentity, admins: readonly string[]): Promise<User> {
  const email = login.email.trim().toLowerCase();
  return sql.transaction(async (tx) => {
    let userId = (
      await one<{ user_id: number }>(tx, "SELECT user_id FROM identities WHERE iss = $1 AND sub = $2", [
        login.iss,
        login.sub,
      ])
    )?.user_id;
    if (userId === undefined) {
      const shadow = await one<{ id: number }>(tx, "SELECT id FROM users WHERE email = $1 AND registered_at IS NULL", [
        email,
      ]);
      userId =
        shadow?.id ??
        (await one<{ id: number }>(tx, "INSERT INTO users (email) VALUES ($1) RETURNING id", [email]))!.id;
      await tx.query("INSERT INTO identities (iss, sub, user_id) VALUES ($1, $2, $3)", [login.iss, login.sub, userId]);
    } else {
      await claimShadowUser(tx, userId, email);
    }
    await tx.query(
      `UPDATE users SET email = $2, has_mfa = $3, registered_at = COALESCE(registered_at, now()),
         reactivated_at = CASE WHEN last_login_at < now() - interval '${DORMANT_AFTER}' THEN now() ELSE reactivated_at END,
         last_login_at = now()
       WHERE id = $1`,
      [userId, email, login.mfa],
    );
    await tx.query("UPDATE identities SET last_login_at = now() WHERE iss = $1 AND sub = $2", [login.iss, login.sub]);
    if (admins.includes(email)) await setServerRole(tx, userId, "admin", "ANNOTINDER_ADMINS");
    return (await userById(tx, userId))!;
  });
}

/** A shadow user with this email, other than `userId`, is claimed by it: its roles (and plan, if they have none) move over. */
async function claimShadowUser(sql: Sql, userId: number, email: string): Promise<void> {
  const shadow = await one<{ id: number; plan_id: number | null }>(
    sql,
    "SELECT id, plan_id FROM users WHERE email = $1 AND registered_at IS NULL AND id <> $2",
    [email, userId],
  );
  if (!shadow) return;
  // An invitation unclaimed for 3 months is expired (docs/accounts.md "Safeguards"): its roles don't move
  await sql.query("DELETE FROM roles WHERE user_id = $1 AND granted_at < now() - interval '3 months'", [shadow.id]);
  // Roles the user already has in the same place win over the invitation's
  await sql.query(
    `DELETE FROM roles s WHERE s.user_id = $1 AND EXISTS (
       SELECT 1 FROM roles o WHERE o.user_id = $2 AND o.study_id IS NOT DISTINCT FROM s.study_id AND o.email_domain IS NOT DISTINCT FROM s.email_domain)`,
    [shadow.id, userId],
  );
  await sql.query("UPDATE roles SET user_id = $2 WHERE user_id = $1", [shadow.id, userId]);
  await sql.query("UPDATE users SET plan_id = COALESCE(plan_id, $2) WHERE id = $1", [userId, shadow.plan_id]);
  await sql.query("DELETE FROM users WHERE id = $1", [shadow.id]);
}

/**
 * JIT re-claiming after changing login providers without account linking
 * (docs/accounts.md "Changing providers"): forgets every login identity and
 * ends all sessions; registered users become shadow users, claimed by the
 * next login with their (verified) email address. Their own roles count
 * from now, so the 3 months to claim them start now. Of users sharing an
 * email address, only the one who logged in last can be claimed.
 */
export async function resetIdentities(sql: Sql): Promise<{ users: number; unclaimable: number }> {
  return sql.transaction(async (tx) => {
    await tx.query("DELETE FROM identities");
    await tx.query("DELETE FROM sessions");
    await tx.query(
      "UPDATE roles SET granted_at = now() WHERE user_id IN (SELECT id FROM users WHERE registered_at IS NOT NULL)",
    );
    const reset = await tx.query<{ id: number }>(
      `UPDATE users u SET registered_at = NULL WHERE u.registered_at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM users o WHERE o.email = u.email AND o.id <> u.id
           AND (o.registered_at IS NULL OR o.last_login_at > u.last_login_at OR (o.last_login_at IS NOT DISTINCT FROM u.last_login_at AND o.id > u.id)))
       RETURNING u.id`,
    );
    const left = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM users WHERE registered_at IS NOT NULL");
    return { users: reset.length, unclaimable: left?.n ?? 0 };
  });
}

/**
 * A new key for a user: returned this once, stored as a hash. Made only in
 * a web session with a recent second factor (or by the server's operator),
 * and never allowed sensitive actions (researcher/auth.ts).
 */
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
  return (await sql.query<ApiKeyRow>("SELECT * FROM api_keys WHERE user_id = $1 ORDER BY id", [userId])).map(
    toApiKeyResponse,
  );
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

/** The user an API key belongs to, if the key is valid (and not revoked) and the user isn't blocked. Records its use. */
export async function userForKey(sql: Sql, key: string): Promise<User | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = await one<User>(
    sql,
    `UPDATE api_keys k SET last_used = now() FROM users u
     WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND u.id = k.user_id AND u.blocked_at IS NULL
     RETURNING u.id, u.email, account_role(u.id) AS role`,
    [hashKey(key)],
  );
  return row ?? null;
}

// ---- registration ------------------------------------------------------------

/** Whether an email address is at a domain rule's domain (`uni.nl`, or `*.uni.nl` for subdomains too). */
export function emailAtDomain(email: string, domain: string): boolean {
  const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (domain.startsWith("*.")) {
    const base = domain.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === domain;
}

/**
 * The server's settings (one row; made with the defaults if it isn't there).
 * `registration.open` is the role row that makes every user a researcher.
 */
export async function getSettings(sql: Sql): Promise<ServerSettings> {
  await sql.query("INSERT INTO server_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING");
  const row = await one<{
    registration: { requests: boolean };
    default_plan_id: number | null;
    unit_bytes: number;
    answer_bytes: number;
    open: boolean;
  }>(
    sql,
    `SELECT s.*, EXISTS (SELECT 1 FROM roles WHERE study_id IS NULL AND user_id IS NULL AND email_domain IS NULL AND role = 'researcher') AS open
     FROM server_settings s`,
  );
  return {
    registration: { open: row!.open, requests: row!.registration.requests ?? true },
    defaultPlanId: row!.default_plan_id,
    unitBytes: row!.unit_bytes,
    answerBytes: row!.answer_bytes,
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
export async function effectiveLimits(sql: Sql, userId: number): Promise<Limits> {
  const user = await one<{ email: string; plan_id: number | null; limits: Limits }>(
    sql,
    "SELECT email, plan_id, limits FROM users WHERE id = $1",
    [userId],
  );
  if (!user) return {};
  const plans = new Map(
    (await sql.query<{ id: number; limits: Limits }>("SELECT id, limits FROM plans")).map((p) => [p.id, p.limits]),
  );
  let base: Limits | undefined = user.plan_id !== null ? plans.get(user.plan_id) : undefined;
  if (!base) {
    const rules = await sql.query<{ domain: string; plan_id: number | null }>(
      "SELECT domain, plan_id FROM domain_plans",
    );
    const domainPlans = rules
      .filter((r) => emailAtDomain(user.email, r.domain))
      .flatMap((r) => (plans.has(r.plan_id!) ? [plans.get(r.plan_id!)!] : []));
    if (domainPlans.length > 0) {
      base = {};
      for (const key of LIMIT_KEYS) base[key] = domainPlans.map((p) => p[key] ?? null).reduce((a, b) => generous(a, b));
    }
  }
  if (!base) {
    const { defaultPlanId } = await getSettings(sql);
    base = defaultPlanId !== null ? (plans.get(defaultPlanId) ?? {}) : {};
  }
  const limits: Limits = {};
  for (const key of LIMIT_KEYS) {
    const own = user.limits[key];
    limits[key] = own !== undefined ? own : (base[key] ?? null);
  }
  return limits;
}

/** What a user's owned studies hold. */
export async function usage(sql: Sql, userId: number): Promise<{ studies: number; units: number }> {
  const row = await one<{ studies: number; units: number }>(
    sql,
    `SELECT (SELECT count(*)::int FROM studies WHERE owner_id = $1) AS studies,
            (SELECT count(*)::int FROM units u JOIN studies j ON j.id = u.study_id WHERE j.owner_id = $1 AND u.in_draft) AS units`,
    [userId],
  );
  return row!;
}
