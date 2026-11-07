import { EMPTY_SESSION, type UnitChanges, type UnitData, type UnitField, type UnitMeta, type UnitResponse } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { designVersionUnits, type DesignVersionRow } from "./designVersions.js";

// Units (docs/plans/design.md §5, migration 0026): field values stored once
// per study (unit_values). `unit_draft` is each unit's working copy; deploys
// make versions (unit_versions + unit_version_fields), the current one with
// to_deploy NULL. A replaced version no answer points to is deleted at the
// deploy that replaces it. Sets: the draft's and the deployed (`live`) ones.

/** A unit of the draft, with its data. */
export interface UnitRow {
  id: number;
  study_id: number;
  external_id: string;
  /** Of its data: changes when its content does. */
  hash: string;
  data: UnitData;
  /** A coder answered about it. */
  coded: boolean;
}

/** Draft units (`UnitRow`) matching `where` (over `u`, the units table), in id order. */
export function draftUnits(sql: Sql, where: string, params: unknown[], tail = ""): Promise<UnitRow[]> {
  return sql.query<UnitRow>(
    `SELECT *, unit_data_hash(data) AS hash FROM (
       SELECT u.id, u.study_id, u.external_id, u.coded, unit_draft_data(u.id) AS data FROM units u WHERE u.in_draft AND ${where} ORDER BY u.id ${tail}
     ) t`,
    params,
  );
}

/**
 * Serializes a study's unit writes with its deploys (`write`), and answer
 * writes against them (`read`, shared): a deploy deletes versions nobody
 * answered and values nothing refers to, which a concurrent upload or
 * answer could be about to use. Held until the transaction ends: call it
 * inside one.
 */
export async function lockUnits(sql: Sql, studyId: number, mode: "write" | "read"): Promise<void> {
  await sql.query(mode === "write" ? "SELECT pg_advisory_xact_lock($1, $2)" : "SELECT pg_advisory_xact_lock_shared($1, $2)", [UNITS_LOCK, studyId]);
}
const UNITS_LOCK = 24026;

/** The study's latest design version (the draft, or the deployed one if there is no draft). */
export function latestDesignVersion(sql: Sql, studyId: number): Promise<DesignVersionRow | undefined> {
  return one<DesignVersionRow>(sql, "SELECT * FROM design_versions WHERE study_id = $1 ORDER BY id DESC LIMIT 1", [studyId]);
}

/** The study's unit fields: the latest design's (docs/plans/design.md §3). */
export async function getUnitFields(sql: Sql, studyId: number): Promise<UnitField[]> {
  const latest = await latestDesignVersion(sql, studyId);
  return latest ? designVersionUnits(latest).fields : [];
}

/** Units in the draft. */
export async function unitCount(sql: Sql, studyId: number): Promise<number> {
  return (await one<{ n: number }>(sql, "SELECT COUNT(*)::int AS n FROM units WHERE study_id = $1 AND in_draft", [studyId]))!.n;
}

export function toUnitResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.external_id, data: row.data, coded: row.coded };
}

export function toUnitMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.external_id, hash: row.hash, coded: row.coded };
}

/**
 * Writes the unit fields into the design's draft: the latest codebook if it
 * is a draft (without a new revision: the fields aren't the editor's
 * edits), else a new draft with the latest version's items.
 */
export async function setUnitFields(sql: Sql, studyId: number, fields: UnitField[]): Promise<void> {
  const units = JSON.stringify({ fields });
  const latest = await latestDesignVersion(sql, studyId);
  if (latest && !latest.immutable) {
    await sql.query("UPDATE design_versions SET units = $1 WHERE id = $2", [units, latest.id]);
  } else {
    // A copy of the latest version (items, session, public info), with the new fields
    await sql.query("INSERT INTO design_versions (study_id, note, items, units, session, public) VALUES ($1, $2, $3, $4, $5, $6)", [
      studyId,
      latest ? "Unit fields from an upload" : null,
      JSON.stringify(latest?.items ?? []),
      units,
      JSON.stringify(latest?.session ?? EMPTY_SESSION),
      latest?.public ? JSON.stringify(latest.public) : null,
    ]);
  }
}

/**
 * Puts units in the draft: new ones, or new content for existing ones
 * (also ones taken out of the draft earlier). Returns their ids by
 * external id.
 */
export async function saveUnits(sql: Sql, studyId: number, units: { externalId: string; data: UnitData }[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (units.length === 0) return ids;
  await lockUnits(sql, studyId, "write");
  const all = JSON.stringify(units.map((u) => u.data));
  await sql.query(
    `INSERT INTO unit_values (study_id, hash, value)
     SELECT DISTINCT $1::int, unit_value_hash(e.value), e.value FROM jsonb_array_elements($2::jsonb) d, jsonb_each(d) e
     ON CONFLICT DO NOTHING`,
    [studyId, all],
  );
  await sql.query(
    `INSERT INTO unit_field_names (study_id, name)
     SELECT DISTINCT $1::int, e.key FROM jsonb_array_elements($2::jsonb) d, jsonb_each(d) e
     ON CONFLICT DO NOTHING`,
    [studyId, all],
  );
  for (const unit of units) {
    const row = await one<{ id: number }>(
      sql,
      `INSERT INTO units (study_id, external_id, in_draft) VALUES ($1, $2, true)
       ON CONFLICT (study_id, external_id) DO UPDATE SET in_draft = true RETURNING id`,
      [studyId, unit.externalId],
    );
    await sql.query("DELETE FROM unit_draft WHERE unit_id = $1", [row!.id]);
    await sql.query(
      `INSERT INTO unit_draft (unit_id, field_id, value_id)
       SELECT $2::int, n.id, v.id FROM jsonb_each($3::jsonb) e
       JOIN unit_field_names n ON n.study_id = $1 AND n.name = e.key
       JOIN unit_values v ON v.study_id = $1 AND v.hash = unit_value_hash(e.value)`,
      [studyId, row!.id, JSON.stringify(unit.data)],
    );
    ids.set(unit.externalId, row!.id);
  }
  await deleteUnusedValues(sql, studyId);
  return ids;
}

/** Takes fields out of every draft unit (their values stay in deployed versions). */
export async function dropDraftFields(sql: Sql, studyId: number, names: string[]): Promise<void> {
  if (names.length === 0) return;
  await lockUnits(sql, studyId, "write");
  await sql.query(
    `DELETE FROM unit_draft d USING units u, unit_field_names n
     WHERE d.unit_id = u.id AND u.study_id = $1 AND d.field_id = n.id AND n.name = ANY($2)`,
    [studyId, names],
  );
  await deleteUnusedValues(sql, studyId);
}

/**
 * Takes a unit out of the draft. A unit never deployed and without answers
 * is deleted; otherwise it stays for those (and comes back when uploaded again).
 */
export async function removeUnit(sql: Sql, studyId: number, unitId: number): Promise<void> {
  await lockUnits(sql, studyId, "write");
  await sql.query("DELETE FROM unit_set_members m USING unit_sets s WHERE m.set_id = s.id AND NOT s.live AND s.study_id = $1 AND m.unit_id = $2", [
    studyId,
    unitId,
  ]);
  await sql.query("DELETE FROM unit_draft WHERE unit_id = $1", [unitId]);
  const kept = await one(sql, "SELECT 1 FROM units u WHERE u.id = $1 AND (u.coded OR EXISTS (SELECT 1 FROM unit_versions v WHERE v.unit_id = u.id))", [unitId]);
  if (kept) await sql.query("UPDATE units SET in_draft = false WHERE study_id = $1 AND id = $2", [studyId, unitId]);
  else await sql.query("DELETE FROM units WHERE study_id = $1 AND id = $2", [studyId, unitId]);
  await deleteUnusedValues(sql, studyId);
}

/** Values neither a draft nor a version refers to. */
async function deleteUnusedValues(sql: Sql, studyId: number): Promise<void> {
  await sql.query(
    `DELETE FROM unit_values v WHERE v.study_id = $1
       AND NOT EXISTS (SELECT 1 FROM unit_draft d WHERE d.value_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM unit_version_fields f WHERE f.value_id = v.id)`,
    [studyId],
  );
}

/** Per unit, its draft content and its current version's, as comparable maps of field id -> value id. */
const CONTENT = `
  draft AS (
    SELECT u.id AS unit_id, COALESCE((SELECT jsonb_object_agg(d.field_id, d.value_id) FROM unit_draft d WHERE d.unit_id = u.id), '{}') AS content
    FROM units u WHERE u.study_id = $1 AND u.in_draft
  ),
  live AS (
    SELECT v.unit_id, v.id AS version_id,
      COALESCE((SELECT jsonb_object_agg(f.field_id, f.value_id) FROM unit_version_fields f WHERE f.version_id = v.id), '{}') AS content
    FROM unit_versions v WHERE v.study_id = $1 AND v.to_deploy IS NULL
  )`;

/** The sets' membership, draft or live, as comparable rows. */
const SETS = `
  dsets AS (SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id WHERE s.study_id = $1 AND NOT s.live),
  lsets AS (SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id WHERE s.study_id = $1 AND s.live)`;

/** The draft's units compared with the deployed ones: added, changed, removed, and whether the sets differ. */
export async function unitChanges(sql: Sql, studyId: number): Promise<UnitChanges> {
  const row = await one<UnitChanges>(
    sql,
    `WITH ${CONTENT}, ${SETS}
     SELECT (SELECT COUNT(*)::int FROM draft d WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.unit_id = d.unit_id)) AS added,
            (SELECT COUNT(*)::int FROM draft d JOIN live l ON l.unit_id = d.unit_id WHERE l.content <> d.content) AS changed,
            (SELECT COUNT(*)::int FROM live l WHERE NOT EXISTS (SELECT 1 FROM draft d WHERE d.unit_id = l.unit_id)) AS removed,
            EXISTS (SELECT * FROM dsets EXCEPT SELECT * FROM lsets) OR EXISTS (SELECT * FROM lsets EXCEPT SELECT * FROM dsets) AS sets`,
    [studyId],
  );
  return row!;
}

/** Whether a change summary changes anything. */
export const anyUnitChanges = (c: UnitChanges) => c.added > 0 || c.changed > 0 || c.removed > 0 || c.sets;

/**
 * Deploys the draft units and sets as deployment version `deploy`: a new
 * version for every added or changed unit (the current one closes),
 * removed units' versions close, the draft's sets become the live ones.
 * Replaced versions no answer points to are deleted, with units nothing
 * keeps and values nothing refers to.
 */
export async function deployDraftUnits(sql: Sql, studyId: number, deploy: number): Promise<void> {
  await lockUnits(sql, studyId, "write");
  const changed = await sql.query<{ unit_id: number; version_id: number | null }>(
    `WITH ${CONTENT}
     SELECT d.unit_id, l.version_id FROM draft d LEFT JOIN live l ON l.unit_id = d.unit_id WHERE l.unit_id IS NULL OR l.content <> d.content
     UNION ALL
     SELECT l.unit_id, l.version_id FROM live l WHERE NOT EXISTS (SELECT 1 FROM draft d WHERE d.unit_id = l.unit_id)`,
    [studyId],
  );
  const closing = changed.flatMap((c) => (c.version_id === null ? [] : [c.version_id]));
  if (closing.length > 0) await sql.query("UPDATE unit_versions SET to_deploy = $1 WHERE id = ANY($2)", [deploy - 1, closing]);
  const opening = await sql.query<{ id: number; unit_id: number }>(
    `INSERT INTO unit_versions (study_id, unit_id, from_deploy)
     SELECT $1, u.id, $2 FROM units u WHERE u.id = ANY($3) AND u.in_draft RETURNING id, unit_id`,
    [studyId, deploy, changed.map((c) => c.unit_id)],
  );
  if (opening.length > 0) {
    await sql.query(
      `INSERT INTO unit_version_fields (version_id, field_id, value_id)
       SELECT v.id, d.field_id, d.value_id FROM unit_versions v JOIN unit_draft d ON d.unit_id = v.unit_id WHERE v.id = ANY($1)`,
      [opening.map((o) => o.id)],
    );
  }
  // The draft's sets become the live ones
  await sql.query("DELETE FROM unit_sets WHERE study_id = $1 AND live", [studyId]);
  await sql.query(
    `WITH copied AS (
       INSERT INTO unit_sets (study_id, live, grp, name) SELECT study_id, true, grp, name FROM unit_sets WHERE study_id = $1 AND NOT live RETURNING id, grp, name
     )
     INSERT INTO unit_set_members (set_id, unit_id, position)
     SELECT c.id, m.unit_id, m.position FROM copied c
     JOIN unit_sets s ON s.study_id = $1 AND NOT s.live AND s.grp = c.grp AND s.name = c.name
     JOIN unit_set_members m ON m.set_id = s.id`,
    [studyId],
  );
  // Replaced versions nobody coded, units nothing keeps, values nothing refers to
  await sql.query(
    `DELETE FROM unit_versions v WHERE v.study_id = $1 AND v.to_deploy IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM annotation_values a WHERE a.unit_version_id = v.id)`,
    [studyId],
  );
  await sql.query(
    `DELETE FROM units u WHERE u.study_id = $1 AND NOT u.in_draft AND NOT u.coded
       AND NOT EXISTS (SELECT 1 FROM unit_versions v WHERE v.unit_id = u.id)`,
    [studyId],
  );
  await deleteUnusedValues(sql, studyId);
}

/** A unit as coders get it: deployed (its current version), or (a preview) the draft. */
export interface ServedUnitRow {
  id: number;
  external_id: string;
  /** The current version (0 for a draft: previews keep nothing). */
  version_id: number;
  hash: string;
  data: UnitData;
}

/** Units as coders get them, by id: the current versions (`live`), or the drafts (previews). */
export async function servedUnits(sql: Sql, studyId: number, live: boolean, ids: number[]): Promise<ServedUnitRow[]> {
  if (!live) {
    return (await draftUnits(sql, "u.study_id = $1 AND u.id = ANY($2)", [studyId, ids])).map((r) => ({ ...r, version_id: 0 }));
  }
  return sql.query<ServedUnitRow>(
    `SELECT *, unit_data_hash(data) AS hash FROM (
       SELECT u.id, u.external_id, v.id AS version_id, unit_version_data(v.id) AS data
       FROM units u JOIN unit_versions v ON v.unit_id = u.id AND v.to_deploy IS NULL WHERE u.study_id = $1 AND u.id = ANY($2)
     ) t`,
    [studyId, ids],
  );
}
