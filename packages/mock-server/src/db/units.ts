import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { fieldsOfUnits, type UnitData, type UnitField } from "@annotinder/contracts";

/**
 * A unit's content hash (`AnnotatorUnit.hash`, `UnitMeta.hash`): changes when
 * its content does.
 */
export function unitHash(externalId: string, data: string): string {
  return createHash("sha256").update(externalId).update(data).digest("hex").slice(0, 16);
}

/**
 * The job's unit fields (contracts unitFields.ts): stored when the first
 * units are uploaded. Units from before fields existed get them inferred from
 * their data (all text, for CSV uploads), stored on first use.
 */
export function jobUnitFields(db: DatabaseSync, jobId: number): UnitField[] {
  const stored = db
    .prepare("SELECT name, type FROM unit_fields WHERE jobId = ? ORDER BY position")
    .all(jobId) as unknown as UnitField[];
  if (stored.length > 0) return stored;
  const rows = db.prepare("SELECT data FROM units WHERE jobId = ? ORDER BY id").all(jobId) as unknown as { data: string }[];
  if (rows.length === 0) return [];
  const inferred = fieldsOfUnits(rows.map((r) => JSON.parse(r.data) as UnitData));
  // Old data that mixes types: keep it as text
  const fields =
    "fields" in inferred
      ? inferred.fields
      : [...new Set(rows.flatMap((r) => Object.keys(JSON.parse(r.data))))].map((name) => ({ name, type: "text" as const }));
  setJobUnitFields(db, jobId, fields);
  return fields;
}

export function setJobUnitFields(db: DatabaseSync, jobId: number, fields: UnitField[]): void {
  db.prepare("DELETE FROM unit_fields WHERE jobId = ?").run(jobId);
  const insert = db.prepare("INSERT INTO unit_fields (jobId, position, name, type) VALUES (?, ?, ?, ?)");
  fields.forEach((f, i) => insert.run(jobId, i, f.name, f.type));
}
