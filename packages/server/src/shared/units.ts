import type { UnitChanges, UnitData, UnitField, UnitMeta, UnitResponse } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";

// Units (docs/plans/design.md §5, migration 0024): field values stored once
// per job by content, a unit version is a map of field -> value id. `units`
// is the draft (each unit's current version; NULL: removed from it). A
// deployment runs a snapshot: which version of which unit, and the sets.

/** A unit of the draft, with its data. */
export interface UnitRow {
  id: number;
  job_id: number;
  external_id: string;
  version_id: number;
  /** The version's content hash: changes when the unit's content does. */
  hash: string;
  data: UnitData;
  /** A coder answered about it. */
  coded: boolean;
}

/** Selects draft units (`UnitRow`), as `u`; add conditions with AND. */
export const DRAFT_UNITS = `SELECT u.id, u.job_id, u.external_id, u.version_id, v.hash, unit_data(v.fields) AS data, u.coded
  FROM units u JOIN unit_versions v ON v.id = u.version_id WHERE u.version_id IS NOT NULL`;

/** The job's unit fields (contracts unitFields.ts), set by the first upload. */
export function getUnitFields(sql: Sql, jobId: number): Promise<UnitField[]> {
  return sql.query<UnitField>("SELECT name, type FROM unit_fields WHERE job_id = $1 ORDER BY position", [jobId]);
}

/** Units in the draft. */
export async function unitCount(sql: Sql, jobId: number): Promise<number> {
  return (await one<{ n: number }>(sql, "SELECT COUNT(*)::int AS n FROM units WHERE job_id = $1 AND version_id IS NOT NULL", [jobId]))!.n;
}

export function toUnitResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.external_id, data: row.data, coded: row.coded };
}

export function toUnitMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.external_id, hash: row.hash, coded: row.coded };
}

export async function setUnitFields(sql: Sql, jobId: number, fields: UnitField[]): Promise<void> {
  await sql.query("DELETE FROM unit_fields WHERE job_id = $1", [jobId]);
  for (const [i, f] of fields.entries()) {
    await sql.query("INSERT INTO unit_fields (job_id, position, name, type) VALUES ($1, $2, $3, $4)", [jobId, i, f.name, f.type]);
  }
}

/**
 * Puts units in the draft: new ones, or a new version of existing ones
 * (also ones removed from the draft earlier). Values already stored are
 * reused. Returns the units' ids by external id.
 */
export async function saveUnits(sql: Sql, jobId: number, units: { externalId: string; data: UnitData }[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (units.length === 0) return ids;
  await sql.query(
    `INSERT INTO unit_values (job_id, hash, value)
     SELECT DISTINCT $1::int, unit_value_hash(e.value), e.value FROM jsonb_array_elements($2::jsonb) d, jsonb_each(d) e
     ON CONFLICT DO NOTHING`,
    [jobId, JSON.stringify(units.map((u) => u.data))],
  );
  for (const unit of units) {
    const data = JSON.stringify(unit.data);
    const row = await one<{ id: number }>(
      sql,
      `INSERT INTO units (job_id, external_id) VALUES ($1, $2)
       ON CONFLICT (job_id, external_id) DO UPDATE SET external_id = excluded.external_id RETURNING id`,
      [jobId, unit.externalId],
    );
    const version = await one<{ id: number }>(
      sql,
      `INSERT INTO unit_versions (job_id, unit_id, hash, fields) VALUES ($1, $2, unit_content_hash($3::jsonb), unit_value_ids($1, $3::jsonb))
       ON CONFLICT (unit_id, hash) DO UPDATE SET hash = excluded.hash RETURNING id`,
      [jobId, row!.id, data],
    );
    await sql.query("UPDATE units SET version_id = $1 WHERE id = $2", [version!.id, row!.id]);
    ids.set(unit.externalId, row!.id);
  }
  return ids;
}

/**
 * Takes a unit out of the draft. A unit in no snapshot and without answers
 * is deleted; otherwise it stays for those (and can come back by uploading it again).
 */
export async function removeUnit(sql: Sql, jobId: number, unitId: number): Promise<void> {
  await sql.query("DELETE FROM unit_sets WHERE job_id = $1 AND unit_id = $2", [jobId, unitId]);
  const kept = await one(sql, "SELECT 1 FROM snapshot_units WHERE unit_id = $1 LIMIT 1", [unitId]);
  const coded = await one(sql, "SELECT 1 FROM units WHERE id = $1 AND coded", [unitId]);
  if (kept || coded) await sql.query("UPDATE units SET version_id = NULL WHERE job_id = $1 AND id = $2", [jobId, unitId]);
  else await sql.query("DELETE FROM units WHERE job_id = $1 AND id = $2", [jobId, unitId]);
}

/**
 * The draft's units compared with a snapshot (null: none deployed yet):
 * added, changed (another version), removed, and whether the sets differ.
 */
export async function unitChanges(sql: Sql, jobId: number, snapshotId: number | null): Promise<UnitChanges> {
  const row = await one<UnitChanges>(
    sql,
    `WITH draft AS (SELECT id AS unit_id, version_id FROM units WHERE job_id = $1 AND version_id IS NOT NULL),
          live AS (SELECT unit_id, version_id FROM snapshot_units WHERE snapshot_id = $2),
          dsets AS (SELECT grp, set_name, unit_id, position FROM unit_sets WHERE job_id = $1),
          lsets AS (SELECT grp, set_name, unit_id, position FROM snapshot_sets WHERE snapshot_id = $2)
     SELECT (SELECT COUNT(*)::int FROM draft d WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.unit_id = d.unit_id)) AS added,
            (SELECT COUNT(*)::int FROM draft d JOIN live l ON l.unit_id = d.unit_id WHERE l.version_id <> d.version_id) AS changed,
            (SELECT COUNT(*)::int FROM live l WHERE NOT EXISTS (SELECT 1 FROM draft d WHERE d.unit_id = l.unit_id)) AS removed,
            EXISTS (SELECT * FROM dsets EXCEPT SELECT * FROM lsets) OR EXISTS (SELECT * FROM lsets EXCEPT SELECT * FROM dsets) AS sets`,
    [jobId, snapshotId ?? 0],
  );
  return row!;
}

/** Whether a change summary changes anything. */
export const anyUnitChanges = (c: UnitChanges) => c.added > 0 || c.changed > 0 || c.removed > 0 || c.sets;

/** A snapshot of the draft's units and sets: the units a deployment runs. */
export async function snapshotDraft(sql: Sql, jobId: number): Promise<number> {
  const snapshot = (await one<{ id: number }>(sql, "INSERT INTO unit_snapshots (job_id) VALUES ($1) RETURNING id", [jobId]))!.id;
  await sql.query(
    "INSERT INTO snapshot_units (snapshot_id, unit_id, version_id) SELECT $1, id, version_id FROM units WHERE job_id = $2 AND version_id IS NOT NULL",
    [snapshot, jobId],
  );
  await sql.query(
    "INSERT INTO snapshot_sets (snapshot_id, grp, set_name, unit_id, position) SELECT $1, grp, set_name, unit_id, position FROM unit_sets WHERE job_id = $2",
    [snapshot, jobId],
  );
  return snapshot;
}

/** A deployed unit: the version a snapshot has, with its data. */
export interface SnapshotUnitRow {
  id: number;
  external_id: string;
  version_id: number;
  hash: string;
  data: UnitData;
}

/** Units of a snapshot (null: the draft, for previews) by id. */
export function snapshotUnits(sql: Sql, jobId: number, snapshotId: number | null, ids: number[]): Promise<SnapshotUnitRow[]> {
  if (snapshotId === null) {
    return sql.query<SnapshotUnitRow>(`${DRAFT_UNITS} AND u.job_id = $1 AND u.id = ANY($2)`, [jobId, ids]);
  }
  return sql.query<SnapshotUnitRow>(
    `SELECT u.id, u.external_id, s.version_id, v.hash, unit_data(v.fields) AS data
     FROM snapshot_units s JOIN units u ON u.id = s.unit_id JOIN unit_versions v ON v.id = s.version_id
     WHERE s.snapshot_id = $1 AND s.unit_id = ANY($2)`,
    [snapshotId, ids],
  );
}
