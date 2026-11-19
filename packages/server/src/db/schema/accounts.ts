import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { Limits } from "@annotinder/contracts";
import { timestamptz } from "./columns.js";
import { studies } from "./studies.js";

// Accounts and the server (docs/accounts.md, docs/security.md).

/** Plans: limits on what researchers may create (studies, units, coders, ...). */
export const plans = pgTable("plans", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique("plans_name_key"),
  limits: jsonb().$type<Limits>().notNull().default({}),
});

/**
 * People who log in (researchers, admins; coders don't need an account).
 * plan_id and limits override the default plan; blocked_at: no access.
 * registered_at NULL: a shadow user, made when a role was granted to an
 * email address before its owner logged in (one per address).
 * reactivated_at: unblocked or recovered; roles granted before it need a
 * second factor (role resolution, `roleApplies`).
 */
export const users = pgTable(
  "users",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: text().notNull(),
    planId: integer().references(() => plans.id, { onDelete: "set null" }),
    limits: jsonb().$type<Limits>().notNull().default({}),
    created: timestamptz().notNull().defaultNow(),
    lastLoginAt: timestamptz(),
    blockedAt: timestamptz(),
    registeredAt: timestamptz(),
    /** The provider confirmed the address at the latest login (`email_verified: true`); NULL for shadow users. */
    emailVerified: boolean(),
    hasMfa: boolean().notNull().default(false),
    reactivatedAt: timestamptz(),
  },
  (t) => [
    index("users_email").on(t.email),
    uniqueIndex("users_shadow_email")
      .on(t.email)
      .where(sql`${t.registeredAt} IS NULL`),
  ],
);

/** Accounts from identity providers: the issuer's subject, linked to a user. */
export const identities = pgTable(
  "identities",
  {
    iss: text().notNull(),
    sub: text().notNull(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedAt: timestamptz().notNull().defaultNow(),
    lastLoginAt: timestamptz(),
  },
  (t) => [primaryKey({ name: "identities_pkey", columns: [t.iss, t.sub] }), index("identities_user").on(t.userId)],
);

/**
 * Roles: on the server (study_id NULL: researcher, admin) or on a study
 * (READ, WRITE, ADMIN), for a user, everyone with an email at a domain, or
 * everyone (require_email: with a non-empty email). Admin roles go to users
 * only. Which roles apply: `roleApplies` (src/db/sql.ts).
 */
export const roles = pgTable(
  "roles",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    role: text().notNull(),
    studyId: integer().references(() => studies.id, { onDelete: "cascade" }),
    userId: integer().references(() => users.id, { onDelete: "cascade" }),
    emailDomain: text(),
    requireEmail: boolean().notNull().default(true),
    grantedAt: timestamptz().notNull().defaultNow(),
    grantedBy: text(),
  },
  (t) => [
    index("roles_study").on(t.studyId),
    index("roles_user").on(t.userId),
    // One role per user on the server and per user on a study; one per domain and one for everyone on the server.
    uniqueIndex("roles_user_server")
      .on(t.userId)
      .where(sql`${t.studyId} IS NULL AND ${t.userId} IS NOT NULL AND ${t.emailDomain} IS NULL`),
    uniqueIndex("roles_user_study")
      .on(t.studyId, t.userId)
      .where(sql`${t.studyId} IS NOT NULL AND ${t.userId} IS NOT NULL AND ${t.emailDomain} IS NULL`),
    uniqueIndex("roles_domain_server")
      .on(t.emailDomain)
      .where(sql`${t.studyId} IS NULL AND ${t.userId} IS NULL AND ${t.emailDomain} IS NOT NULL`),
    uniqueIndex("roles_everyone_server")
      .on(t.role)
      .where(sql`${t.studyId} IS NULL AND ${t.userId} IS NULL AND ${t.emailDomain} IS NULL`),
    check(
      "roles_role_fits_context",
      sql`(${t.studyId} IS NULL AND ${t.role} IN ('researcher', 'admin')) OR (${t.studyId} IS NOT NULL AND ${t.role} IN ('READ', 'WRITE', 'ADMIN'))`,
    ),
    check("roles_admin_by_user", sql`${t.role} NOT IN ('admin', 'ADMIN') OR ${t.userId} IS NOT NULL`),
  ],
);

/** Users asking for researcher access, and the admin's decision. */
export const researcherRequests = pgTable("researcher_requests", {
  userId: integer()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  message: text().notNull().default(""),
  at: timestamptz().notNull().defaultNow(),
  decidedAt: timestamptz(),
  decidedBy: text(),
  approved: boolean(),
});

/**
 * The server's settings: one row. registration: { requests } (whether users
 * may ask for researcher access); the default plan; the most a unit's data
 * (unit_bytes) or one answer (answer_bytes) may take.
 */
export const serverSettings = pgTable(
  "server_settings",
  {
    id: boolean().primaryKey().default(true),
    registration: jsonb().$type<{ requests?: boolean }>().notNull().default({ requests: true }),
    defaultPlanId: integer().references(() => plans.id),
    unitBytes: integer().notNull().default(262144),
    answerBytes: integer().notNull().default(65536),
  },
  (t) => [check("server_settings_one_row", sql`${t.id}`)],
);

/** Email domains whose users get a plan. */
export const domainPlans = pgTable("domain_plans", {
  domain: text().primaryKey(),
  planId: integer().references(() => plans.id, { onDelete: "set null" }),
});

/** Login sessions (a cookie; key_hash: its hash). mfa: logged in with a second factor; issuer: the identity provider. */
export const sessions = pgTable(
  "sessions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text().notNull().unique("sessions_key_hash_key"),
    mfa: boolean().notNull().default(false),
    created: timestamptz().notNull().defaultNow(),
    expires: timestamptz().notNull(),
    authTime: timestamptz(),
    issuer: text().notNull().default(""),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** API keys for the researcher API (stored as hashes; prefix: to recognize one). */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text().notNull(),
    keyHash: text().notNull().unique("api_keys_key_hash_key"),
    prefix: text().notNull(),
    created: timestamptz().notNull().defaultNow(),
    lastUsed: timestamptz(),
    revokedAt: timestamptz(),
  },
  (t) => [index("api_keys_user").on(t.userId)],
);
