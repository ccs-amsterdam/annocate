import { bigint, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { users } from "./accounts.js";
import { timestamptz } from "./columns.js";

// Logs and rate limits.

/** What happened to a user's security (second factor added, recovery used, ...). */
export const securityLog = pgTable(
  "security_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    at: timestamptz().notNull().defaultNow(),
    event: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("security_log_user").on(t.userId, t.at)],
);

/** What admins did (by email: kept when the admin's account goes). */
export const adminLog = pgTable("admin_log", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamptz().notNull().defaultNow(),
  admin: text().notNull(),
  action: text().notNull(),
  target: text().notNull(),
  details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
});

/**
 * Requests per key (an address, an account) and minute (src/shared/rateLimit.ts).
 * UNLOGGED (set in the custom migration): losing it in a crash only resets the counts.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    minute: timestamptz().notNull(),
    count: integer().notNull().default(1),
  },
  (t) => [primaryKey({ name: "rate_limits_pkey", columns: [t.key, t.minute] })],
);
