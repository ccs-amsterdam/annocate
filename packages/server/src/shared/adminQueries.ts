import type { Context } from "hono";
import type { AdminUser } from "@annotinder/contracts";
import { and, eq, exists, isNotNull, isNull, not, sql, type SQL } from "drizzle-orm";
import type { Env } from "../context.js";
import type { Db } from "../db/index.js";
import {
  adminLog,
  annotationValues,
  coderSessions,
  identities,
  roles,
  studies,
  units,
  users,
} from "../db/schema/index.js";
import { accountRole, roleApplies } from "../db/sql.js";

// What the server admin's API (researcher/admin*.ts) reads: users with where
// their role comes from, studies with how much they hold, and the log of what
// admins did. Never study data.

/** Server roles (not a study's). */
export const serverRole = isNull(roles.studyId);

/**
 * Users with their account role and where it comes from, whether they
 * claimed their account (`registered`), whether their invitation expired
 * (unclaimed 3 months after their first role), roles the safeguards turned
 * off, and whether they linked a login at the current provider (`issuer`).
 */
export function selectUsers(db: Db, issuer: string) {
  const role = accountRole(users.id);
  const registered = sql<boolean>`${users.registeredAt} IS NOT NULL`;
  // Where their account role comes from: their own role, their domain's, or everyone's
  const roleVia = db
    .select({
      via: sql`CASE WHEN bool_or(${roles.userId} IS NOT NULL) THEN 'user' WHEN bool_or(${roles.emailDomain} IS NOT NULL) THEN 'domain' WHEN count(*) > 0 THEN 'everyone' END`,
    })
    .from(roles)
    .where(and(serverRole, roleApplies(roles, users), eq(roles.role, role)));
  const ownRoles = (where: SQL) =>
    db
      .select({ one: sql`1` })
      .from(roles)
      .where(and(eq(roles.userId, users.id), where));
  return db
    .select({
      user: users,
      role,
      roleVia: sql<AdminUser["roleVia"]>`(${roleVia})`,
      registered,
      invitationExpired: sql<boolean>`(${and(isNull(users.registeredAt), exists(ownRoles(sql`${roles.grantedAt} < now() - interval '3 months'`)))})`,
      rolesDisabled: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(roles)
        .where(and(eq(roles.userId, users.id), isNotNull(users.registeredAt), not(roleApplies(roles, users))))})`,
      linked: sql<boolean>`${exists(
        db
          .select({ one: sql`1` })
          .from(identities)
          .where(
            and(eq(identities.userId, users.id), sql`rtrim(${identities.iss}, '/') = rtrim(${issuer}::text, '/')`),
          ),
      )}`,
      studies: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(studies)
        .where(eq(studies.ownerId, users.id))})`,
    })
    .from(users)
    .$dynamic();
}

export type UserRow = Awaited<ReturnType<ReturnType<typeof selectUsers>["execute"]>>[number];

/** Studies with their owner and how much they hold. */
export function selectStudies(db: Db) {
  const counted = (table: typeof units | typeof coderSessions | typeof annotationValues, where?: SQL) =>
    sql<number>`(${db
      .select({ n: sql`count(*)::int` })
      .from(table)
      .where(and(eq(table.studyId, studies.id), where))})`;
  return db
    .select({
      id: studies.id,
      name: studies.name,
      owner: users.email,
      created: studies.created,
      archived: studies.archived,
      suspendedAt: studies.suspendedAt,
      units: counted(units, sql`${units.inDraft}`),
      coders: counted(coderSessions),
      answers: counted(annotationValues),
    })
    .from(studies)
    .leftJoin(users, eq(users.id, studies.ownerId))
    .$dynamic();
}

/** Text to find as it is written in a LIKE pattern: `%` and `_` match themselves. */
export const likeLiteral = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** Records what the admin behind a request did (`admin_log`). */
export const adminLogger =
  (db: Db) =>
  (c: Context<Env>, action: string, target: string, details: object = {}) =>
    db
      .insert(adminLog)
      .values({ admin: c.get("researcher").email, action, target, details: details as Record<string, unknown> });
