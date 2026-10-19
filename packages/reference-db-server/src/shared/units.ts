import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { UnitField, UnitMeta, UnitResponse } from "@annotinder/contracts";

/**
 * A unit's content hash (`AnnotatorUnit.hash`, `UnitMeta.hash`): changes when
 * its content does. Any hash works, as long as it does that.
 */
export function unitHash(externalId: string, data: string): string {
  return createHash("sha256").update(externalId).update(data).digest("hex").slice(0, 16);
}

/** The job's unit fields (contracts unitFields.ts), set by the first upload. */
export function getUnitFields(db: DatabaseSync, jobId: number): UnitField[] {
  return db
    .prepare("SELECT name, type FROM unit_fields WHERE jobId = ? ORDER BY position")
    .all(jobId) as unknown as UnitField[];
}

export interface UnitRow {
  id: number;
  jobId: number;
  externalId: string;
  data: string;
  immutable: number;
}

export function unitCount(db: DatabaseSync, jobId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM units WHERE jobId = ?").get(jobId) as { n: number }).n;
}

export function toUnitResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.externalId, data: JSON.parse(row.data), immutable: !!row.immutable };
}

export function toUnitMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.externalId, hash: unitHash(row.externalId, row.data) };
}

export function setUnitFields(db: DatabaseSync, jobId: number, fields: UnitField[]): void {
  db.prepare("DELETE FROM unit_fields WHERE jobId = ?").run(jobId);
  const insert = db.prepare("INSERT INTO unit_fields (jobId, position, name, type) VALUES (?, ?, ?, ?)");
  fields.forEach((f, i) => insert.run(jobId, i, f.name, f.type));
}
