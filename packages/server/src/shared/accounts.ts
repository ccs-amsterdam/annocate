import { createHash, randomBytes } from "node:crypto";
import type { AccountRole, ApiKeyCreated, ApiKeyResponse, Limits, ServerSettings } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";

// Users, their account role and limits, and their API keys (contracts
// account.ts, docs/accounts.md).

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
  return { id: row.id, label: row.label, prefix: row.prefix, created: row.created, lastUsed: row.last_used, revokedAt: row.revoked_at };
}

/** The user with this email, created if there is none. Emails are compared lowercased. */
export async function ensureUser(sql: Sql, email: string): Promise<User> {
  const row = await one<User>(
    sql,
    `INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = excluded.email RETURNING id, email, role`,
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

/** The user an API key belongs to, if the key is valid (and not revoked) and the user isn't blocked. Records its use. */
export async function userForKey(sql: Sql, key: string): Promise<User | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = await one<User>(
    sql,
    `UPDATE api_keys k SET last_used = now() FROM users u
     WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND u.id = k.user_id AND u.blocked_at IS NULL
     RETURNING u.id, u.email, u.role`,
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

/** The server's settings (one row; made with the defaults if it isn't there). */
export async function getSettings(sql: Sql): Promise<ServerSettings> {
  await sql.query("INSERT INTO server_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING");
  const row = await one<{ registration: ServerSettings["registration"]; default_plan_id: number | null; unit_bytes: number; answer_bytes: number }>(
    sql,
    "SELECT * FROM server_settings",
  );
  return {
    registration: row!.registration,
    defaultPlanId: row!.default_plan_id,
    unitBytes: row!.unit_bytes,
    answerBytes: row!.answer_bytes,
  };
}

/**
 * What a login makes of a user: an admin if the server names them
 * (`ANNOTINDER_ADMINS`), a researcher if registration is open or their
 * email domain makes researchers. Only ever raises a role: an admin's
 * choice to lower one is kept until the rules change.
 */
export async function applyRegistration(sql: Sql, user: User, admins: readonly string[]): Promise<User> {
  let role: AccountRole = user.role;
  if (admins.includes(user.email)) role = "admin";
  else if (role === "user") {
    const { registration } = await getSettings(sql);
    const domains = await sql.query<{ domain: string }>("SELECT domain FROM domain_rules WHERE researcher");
    if (registration.open || domains.some((d) => emailAtDomain(user.email, d.domain))) role = "researcher";
  }
  if (role === user.role) return user;
  await sql.query("UPDATE users SET role = $1 WHERE id = $2", [role, user.id]);
  return { ...user, role };
}

// ---- limits ------------------------------------------------------------------

const LIMIT_KEYS = ["jobs", "unitsPerJob", "units", "codersPerJob", "answersPerJob"] as const;

/** The more generous of two limits (null: no limit). */
const generous = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.max(a, b));

/**
 * A user's limits: their own plan, else the most generous of their email
 * domains' plans, else the default plan; then their personal overrides.
 */
export async function effectiveLimits(sql: Sql, userId: number): Promise<Limits> {
  const user = await one<{ email: string; plan_id: number | null; limits: Limits }>(sql, "SELECT email, plan_id, limits FROM users WHERE id = $1", [
    userId,
  ]);
  if (!user) return {};
  const plans = new Map((await sql.query<{ id: number; limits: Limits }>("SELECT id, limits FROM plans")).map((p) => [p.id, p.limits]));
  let base: Limits | undefined = user.plan_id !== null ? plans.get(user.plan_id) : undefined;
  if (!base) {
    const rules = await sql.query<{ domain: string; plan_id: number | null }>("SELECT domain, plan_id FROM domain_rules WHERE plan_id IS NOT NULL");
    const domainPlans = rules.filter((r) => emailAtDomain(user.email, r.domain)).flatMap((r) => (plans.has(r.plan_id!) ? [plans.get(r.plan_id!)!] : []));
    if (domainPlans.length > 0) {
      base = {};
      for (const key of LIMIT_KEYS) base[key] = domainPlans.map((p) => p[key] ?? null).reduce((a, b) => generous(a, b));
    }
  }
  if (!base) {
    const { defaultPlanId } = await getSettings(sql);
    base = defaultPlanId !== null ? plans.get(defaultPlanId) ?? {} : {};
  }
  const limits: Limits = {};
  for (const key of LIMIT_KEYS) {
    const own = user.limits[key];
    limits[key] = own !== undefined ? own : base[key] ?? null;
  }
  return limits;
}

/** What a user's owned jobs hold. */
export async function usage(sql: Sql, userId: number): Promise<{ jobs: number; units: number }> {
  const row = await one<{ jobs: number; units: number }>(
    sql,
    `SELECT (SELECT count(*)::int FROM jobs WHERE owner_id = $1) AS jobs,
            (SELECT count(*)::int FROM units u JOIN jobs j ON j.id = u.job_id WHERE j.owner_id = $1) AS units`,
    [userId],
  );
  return row!;
}
