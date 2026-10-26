import { createHash } from "node:crypto";
import type { UnitData, UnitField, UnitMeta, UnitResponse } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";

/**
 * A unit's content hash (runtime `Unit.hash`, `UnitMeta.hash`): changes when
 * its content does. Over the external id and the data as JSON, with keys in
 * the order Postgres keeps them (JSONB sorts keys).
 */
export function unitHash(externalId: string, data: UnitData): string {
  return createHash("sha256").update(externalId).update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

/** A row of `units`. */
export interface UnitRow {
  id: number;
  job_id: number;
  external_id: string;
  data: UnitData;
  immutable: boolean;
}

/** The job's unit fields (contracts unitFields.ts), set by the first upload. */
export function getUnitFields(sql: Sql, jobId: number): Promise<UnitField[]> {
  return sql.query<UnitField>("SELECT name, type FROM unit_fields WHERE job_id = $1 ORDER BY position", [jobId]);
}

export async function unitCount(sql: Sql, jobId: number): Promise<number> {
  return (await one<{ n: number }>(sql, "SELECT COUNT(*)::int AS n FROM units WHERE job_id = $1", [jobId]))!.n;
}

export function toUnitResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.external_id, data: row.data, immutable: row.immutable };
}

export function toUnitMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.external_id, hash: unitHash(row.external_id, row.data) };
}

export async function setUnitFields(sql: Sql, jobId: number, fields: UnitField[]): Promise<void> {
  await sql.query("DELETE FROM unit_fields WHERE job_id = $1", [jobId]);
  for (const [i, f] of fields.entries()) {
    await sql.query("INSERT INTO unit_fields (job_id, position, name, type) VALUES ($1, $2, $3, $4)", [jobId, i, f.name, f.type]);
  }
}
