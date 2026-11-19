import { sql, type AnyColumn, type SQL, type SQLWrapper, type Table } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccountRole, Role, UnitData } from "@annotinder/contracts";
import { roles, unitDraft, unitFieldNames, unitValues, unitVersionFields, users } from "./schema/index.js";

// SQL expressions used inside queries: role resolution and unit data. They
// are TypeScript functions that build SQL (not functions in the database),
// so they're versioned with the code and a schema change never has to
// rewrite them.
//
// Each returns its SQL wrapped once more (`sql\`(${body})\``): in a select
// from one table Drizzle writes the columns directly in a selected
// expression without their table, which would make a correlated subquery
// compare a column with itself. Wrapped, they keep their table.

/**
 * `column = ANY(values)`, with the values as one array parameter: for lists
 * that can be long (a study's units). `inArray` makes a parameter per value,
 * and a query takes at most 65535.
 */
export function anyOf(column: SQLWrapper, values: readonly number[] | readonly string[]): SQL<boolean> {
  return sql<boolean>`${column} = ANY(${sql.param(values)})`;
}

/** A table under another name in a raw subquery: its columns, and what goes after FROM. */
function aliased<T extends Table>(table: T, name: string): [T, SQL] {
  return [alias(table, name) as unknown as T, sql`${table} ${sql.identifier(name)}`];
}

type Columns<K extends string> = { [P in K]: AnyColumn };
type RoleColumns = Columns<"role" | "studyId" | "userId" | "emailDomain" | "requireEmail" | "grantedAt">;
type UserColumns = Columns<"id" | "email" | "registeredAt" | "reactivatedAt" | "hasMfa">;

/** Whether an email address is at a domain (`uni.nl`, or `*.uni.nl` for subdomains too); as `emailAtDomain` in shared/accounts.ts. */
export function emailAtDomain(email: SQLWrapper, domain: SQLWrapper): SQL<boolean> {
  const host = sql`split_part(${email}, '@', 2)`;
  const body = sql`CASE WHEN left(${domain}, 2) = '*.'
    THEN ${host} = substr(${domain}, 3) OR right(${host}, length(${domain}) - 1) = substr(${domain}, 2)
    ELSE ${host} = ${domain} END`;
  return sql<boolean>`(${body})`;
}

/**
 * Whether role row `r` applies to user `u` (docs/accounts.md "Safeguards"):
 * the user is registered; the role is theirs, their email domain's, or
 * everyone's (with an email, if required); a role of their own granted before
 * they were reactivated needs a second factor; an invitation claimed more
 * than 3 months after it was granted has expired.
 */
export function roleApplies(r: RoleColumns, u: UserColumns): SQL<boolean> {
  const body = sql`${u.registeredAt} IS NOT NULL
    AND (${r.userId} IS NULL OR ${r.userId} = ${u.id})
    AND (${r.emailDomain} IS NULL OR ${emailAtDomain(u.email, r.emailDomain)})
    AND (${r.userId} IS NOT NULL OR ${r.emailDomain} IS NOT NULL OR NOT ${r.requireEmail} OR ${u.email} <> '')
    AND NOT COALESCE(${r.userId} IS NOT NULL AND ${r.grantedAt} < ${u.reactivatedAt} AND NOT ${u.hasMfa}, false)
    AND NOT COALESCE(${r.userId} IS NOT NULL AND ${u.registeredAt} > ${r.grantedAt} + interval '3 months', false)`;
  return sql<boolean>`(${body})`;
}

/** A user's account role: the highest server role that applies to them (admin, researcher), else `user`. */
export function accountRole(userId: SQLWrapper | number): SQL<AccountRole> {
  const [u, fromUsers] = aliased(users, "account_role_user");
  const [r, fromRoles] = aliased(roles, "account_role_role");
  const highest = sql`
    SELECT CASE max(CASE ${r.role} WHEN 'admin' THEN 2 WHEN 'researcher' THEN 1 END) WHEN 2 THEN 'admin' WHEN 1 THEN 'researcher' END
    FROM ${fromUsers}, ${fromRoles}
    WHERE ${u.id} = ${userId} AND ${r.studyId} IS NULL AND ${roleApplies(r, u)}`;
  return sql<AccountRole>`COALESCE((${highest}), 'user')`;
}

/** A user's role on a study: the highest study role that applies to them (ADMIN, WRITE, READ), else NULL. */
export function studyRole(studyId: SQLWrapper | number, userId: SQLWrapper | number): SQL<Role | null> {
  const [u, fromUsers] = aliased(users, "study_role_user");
  const [r, fromRoles] = aliased(roles, "study_role_role");
  const highest = sql`
    SELECT CASE max(CASE ${r.role} WHEN 'ADMIN' THEN 3 WHEN 'WRITE' THEN 2 WHEN 'READ' THEN 1 END) WHEN 3 THEN 'ADMIN' WHEN 2 THEN 'WRITE' WHEN 1 THEN 'READ' END
    FROM ${fromUsers}, ${fromRoles}
    WHERE ${u.id} = ${userId} AND ${r.studyId} = ${studyId} AND ${roleApplies(r, u)}`;
  return sql<Role | null>`(${highest})`;
}

/** A unit field value's hash (unit_values.hash): sha256 of its JSON. */
export function unitValueHash(value: SQLWrapper): SQL<Uint8Array> {
  const body = sql`sha256(convert_to((${value})::text, 'UTF8'))`;
  return sql<Uint8Array>`(${body})`;
}

/** A unit's data's hash, as hex text (what clients compare). */
export function unitDataHash(data: SQLWrapper): SQL<string> {
  const body = sql`encode(sha256(convert_to((${data})::text, 'UTF8')), 'hex')`;
  return sql<string>`(${body})`;
}

/** A unit's draft data (field name -> value). */
export function unitDraftData(unitId: SQLWrapper | number): SQL<UnitData> {
  const body = sql`
    SELECT COALESCE(jsonb_object_agg(${unitFieldNames.name}, ${unitValues.value}), '{}'::jsonb)
    FROM ${unitDraft}
    JOIN ${unitFieldNames} ON ${unitFieldNames.id} = ${unitDraft.fieldId}
    JOIN ${unitValues} ON ${unitValues.id} = ${unitDraft.valueId}
    WHERE ${unitDraft.unitId} = ${unitId}`;
  return sql<UnitData>`(${body})`;
}

/** A unit version's data (field name -> value). */
export function unitVersionData(versionId: SQLWrapper | number): SQL<UnitData> {
  const body = sql`
    SELECT COALESCE(jsonb_object_agg(${unitFieldNames.name}, ${unitValues.value}), '{}'::jsonb)
    FROM ${unitVersionFields}
    JOIN ${unitFieldNames} ON ${unitFieldNames.id} = ${unitVersionFields.fieldId}
    JOIN ${unitValues} ON ${unitValues.id} = ${unitVersionFields.valueId}
    WHERE ${unitVersionFields.versionId} = ${versionId}`;
  return sql<UnitData>`(${body})`;
}
