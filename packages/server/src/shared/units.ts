import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { EMPTY_SESSION, type UnitChanges, type UnitData, type UnitField, type UnitMeta, type UnitResponse } from "@annotinder/contracts";
import { row, rows, type Db } from "../db/index.js";
import {
  annotationValues,
  designVersions,
  unitDraft,
  unitFieldNames,
  unitSetMembers,
  unitSets,
  unitValues,
  unitVersionFields,
  unitVersions,
  units,
} from "../db/schema/index.js";
import { anyOf, unitDataHash, unitDraftData, unitValueHash, unitVersionData } from "../db/sql.js";
import { designVersionUnits, type DesignVersionRow } from "./designVersions.js";

// Units (docs/architecture.md §8.4): field values stored once per study
// (unit_values). `unit_draft` is each unit's working copy; deploys make
// versions (unit_versions + unit_version_fields), the current one with
// to_deploy NULL. A replaced version no answer points to is deleted at the
// deploy that replaces it. Sets: the draft's and the deployed (`live`) ones.

/** A unit of the draft, with its data. */
export interface UnitRow {
  id: number;
  studyId: number;
  externalId: string;
  /** Of its data: changes when its content does. */
  hash: string;
  data: UnitData;
  /** A coder answered about it. */
  coded: boolean;
}

/** Which draft units (`draftUnits`): by id or external id, or a page of them. */
export interface DraftUnitsQuery {
  ids?: number[];
  externalIds?: string[];
  limit?: number;
  offset?: number;
}

/** A study's draft units with their data, in id order. */
export async function draftUnits(db: Db, studyId: number, query: DraftUnitsQuery = {}): Promise<UnitRow[]> {
  const withData = db
    .select({
      id: units.id,
      studyId: units.studyId,
      externalId: units.externalId,
      coded: units.coded,
      data: unitDraftData(units.id).as("data"),
    })
    .from(units)
    .where(
      and(
        eq(units.studyId, studyId),
        eq(units.inDraft, true),
        query.ids ? anyOf(units.id, query.ids) : undefined,
        query.externalIds ? anyOf(units.externalId, query.externalIds) : undefined,
      ),
    )
    .orderBy(asc(units.id))
    .$dynamic();
  if (query.limit !== undefined) withData.limit(query.limit);
  if (query.offset !== undefined) withData.offset(query.offset);
  const t = withData.as("t");
  return db
    .select({ id: t.id, studyId: t.studyId, externalId: t.externalId, coded: t.coded, data: t.data, hash: unitDataHash(t.data) })
    .from(t)
    .orderBy(asc(t.id));
}

/**
 * Serializes a study's unit writes with its deploys (`write`), and answer
 * writes against them (`read`, shared): a deploy deletes versions nobody
 * answered and values nothing refers to, which a concurrent upload or
 * answer could be about to use. Held until the transaction ends: call it
 * inside one.
 */
export async function lockUnits(db: Db, studyId: number, mode: "write" | "read"): Promise<void> {
  await db.execute(
    mode === "write" ? sql`SELECT pg_advisory_xact_lock(${UNITS_LOCK}, ${studyId})` : sql`SELECT pg_advisory_xact_lock_shared(${UNITS_LOCK}, ${studyId})`,
  );
}
const UNITS_LOCK = 24026;

/** The study's latest design version (the draft, or the deployed one if there is no draft). */
export async function latestDesignVersion(db: Db, studyId: number): Promise<DesignVersionRow | undefined> {
  const [latest] = await db.select().from(designVersions).where(eq(designVersions.studyId, studyId)).orderBy(desc(designVersions.id)).limit(1);
  return latest;
}

/** The study's unit fields: the latest design's (docs/architecture.md §8.4). */
export async function getUnitFields(db: Db, studyId: number): Promise<UnitField[]> {
  const latest = await latestDesignVersion(db, studyId);
  return latest ? designVersionUnits(latest).fields : [];
}

/** Units in the draft. */
export function unitCount(db: Db, studyId: number): Promise<number> {
  return db.$count(units, and(eq(units.studyId, studyId), eq(units.inDraft, true)));
}

export function toUnitResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.externalId, data: row.data, coded: row.coded };
}

export function toUnitMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.externalId, hash: row.hash, coded: row.coded };
}

/**
 * Writes the unit fields into the design's draft: the latest design version if it
 * is a draft (without a new revision: the fields aren't the editor's
 * edits), else a new draft with the latest version's items.
 */
export async function setUnitFields(db: Db, studyId: number, fields: UnitField[]): Promise<void> {
  const latest = await latestDesignVersion(db, studyId);
  if (latest && !latest.immutable) {
    await db.update(designVersions).set({ units: { fields } }).where(eq(designVersions.id, latest.id));
  } else {
    // A copy of the latest version (items, session, public info), with the new fields
    await db.insert(designVersions).values({
      studyId,
      note: latest ? "Unit fields from an upload" : null,
      items: latest?.items ?? [],
      units: { fields },
      session: latest?.session ?? EMPTY_SESSION,
      public: latest?.public ?? null,
    });
  }
}

/**
 * Puts units in the draft: new ones, or new content for existing ones
 * (also ones taken out of the draft earlier). Returns their ids by
 * external id.
 */
export async function saveUnits(db: Db, studyId: number, upload: { externalId: string; data: UnitData }[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (upload.length === 0) return ids;
  await lockUnits(db, studyId, "write");
  // Every (field, value) of the upload, as rows
  const all = JSON.stringify(upload.map((u) => u.data));
  const entries = sql`jsonb_array_elements(${all}::jsonb) d, jsonb_each(d) e`;
  await db.execute(sql`
    INSERT INTO ${unitValues} (study_id, hash, value)
    SELECT DISTINCT ${studyId}::int, ${unitValueHash(sql`e.value`)}, e.value FROM ${entries}
    ON CONFLICT DO NOTHING`);
  await db.execute(sql`
    INSERT INTO ${unitFieldNames} (study_id, name)
    SELECT DISTINCT ${studyId}::int, e.key FROM ${entries}
    ON CONFLICT DO NOTHING`);
  for (const unit of upload) {
    const [saved] = await db
      .insert(units)
      .values({ studyId, externalId: unit.externalId, inDraft: true })
      .onConflictDoUpdate({ target: [units.studyId, units.externalId], set: { inDraft: true } })
      .returning({ id: units.id });
    const unitId = saved!.id;
    await db.delete(unitDraft).where(eq(unitDraft.unitId, unitId));
    await db.execute(sql`
      INSERT INTO ${unitDraft} (unit_id, field_id, value_id)
      SELECT ${unitId}::int, n.id, v.id FROM jsonb_each(${JSON.stringify(unit.data)}::jsonb) e
      JOIN ${unitFieldNames} n ON n.study_id = ${studyId} AND n.name = e.key
      JOIN ${unitValues} v ON v.study_id = ${studyId} AND v.hash = ${unitValueHash(sql`e.value`)}`);
    ids.set(unit.externalId, unitId);
  }
  await deleteUnusedValues(db, studyId);
  return ids;
}

/** Takes fields out of every draft unit (their values stay in deployed versions). */
export async function dropDraftFields(db: Db, studyId: number, names: string[]): Promise<void> {
  if (names.length === 0) return;
  await lockUnits(db, studyId, "write");
  const fields = db
    .select({ id: unitFieldNames.id })
    .from(unitFieldNames)
    .where(and(eq(unitFieldNames.studyId, studyId), inArray(unitFieldNames.name, names)));
  await db.delete(unitDraft).where(inArray(unitDraft.fieldId, fields));
  await deleteUnusedValues(db, studyId);
}

/**
 * Takes a unit out of the draft. A unit never deployed and without answers
 * is deleted; otherwise it stays for those (and comes back when uploaded again).
 */
export async function removeUnit(db: Db, studyId: number, unitId: number): Promise<void> {
  await lockUnits(db, studyId, "write");
  const draftSets = db
    .select({ id: unitSets.id })
    .from(unitSets)
    .where(and(eq(unitSets.studyId, studyId), eq(unitSets.live, false)));
  await db.delete(unitSetMembers).where(and(eq(unitSetMembers.unitId, unitId), inArray(unitSetMembers.setId, draftSets)));
  await db.delete(unitDraft).where(eq(unitDraft.unitId, unitId));
  const unit = and(eq(units.studyId, studyId), eq(units.id, unitId));
  const hasVersions = exists(db.select({ one: sql`1` }).from(unitVersions).where(eq(unitVersions.unitId, units.id)));
  const [kept] = await db
    .select({ id: units.id })
    .from(units)
    .where(and(unit, or(eq(units.coded, true), hasVersions)));
  if (kept) await db.update(units).set({ inDraft: false }).where(unit);
  else await db.delete(units).where(unit);
  await deleteUnusedValues(db, studyId);
}

/** Values neither a draft nor a version refers to. */
async function deleteUnusedValues(db: Db, studyId: number): Promise<void> {
  await db
    .delete(unitValues)
    .where(
      and(
        eq(unitValues.studyId, studyId),
        notExists(db.select({ one: sql`1` }).from(unitDraft).where(eq(unitDraft.valueId, unitValues.id))),
        notExists(db.select({ one: sql`1` }).from(unitVersionFields).where(eq(unitVersionFields.valueId, unitValues.id))),
      ),
    );
}

/**
 * Per unit, its draft content (`draft`) and its current version's (`live`),
 * as comparable maps of field id -> value id: named subqueries (CTEs) for
 * the comparisons below.
 */
const content = (studyId: number) => sql`
  draft AS (
    SELECT u.id AS unit_id,
      COALESCE((SELECT jsonb_object_agg(d.field_id, d.value_id) FROM unit_draft d WHERE d.unit_id = u.id), '{}') AS content
    FROM units u WHERE u.study_id = ${studyId} AND u.in_draft
  ),
  live AS (
    SELECT v.unit_id, v.id AS version_id,
      COALESCE((SELECT jsonb_object_agg(f.field_id, f.value_id) FROM unit_version_fields f WHERE f.version_id = v.id), '{}') AS content
    FROM unit_versions v WHERE v.study_id = ${studyId} AND v.to_deploy IS NULL
  )`;

/** The sets' membership, the draft's (`draft_sets`) and the deployed (`live_sets`), as comparable rows. */
const setRows = (studyId: number) => sql`
  draft_sets AS (
    SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id
    WHERE s.study_id = ${studyId} AND NOT s.live
  ),
  live_sets AS (
    SELECT s.grp, s.name, m.unit_id, m.position FROM unit_sets s LEFT JOIN unit_set_members m ON m.set_id = s.id
    WHERE s.study_id = ${studyId} AND s.live
  )`;

/** The draft's units compared with the deployed ones: added, changed, removed, and whether the sets differ. */
export async function unitChanges(db: Db, studyId: number): Promise<UnitChanges> {
  const changes = await row<UnitChanges>(
    db,
    sql`WITH ${content(studyId)}, ${setRows(studyId)}
    SELECT
      (SELECT count(*)::int FROM draft d WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.unit_id = d.unit_id)) AS added,
      (SELECT count(*)::int FROM draft d JOIN live l ON l.unit_id = d.unit_id WHERE l.content <> d.content) AS changed,
      (SELECT count(*)::int FROM live l WHERE NOT EXISTS (SELECT 1 FROM draft d WHERE d.unit_id = l.unit_id)) AS removed,
      EXISTS (SELECT * FROM draft_sets EXCEPT SELECT * FROM live_sets)
        OR EXISTS (SELECT * FROM live_sets EXCEPT SELECT * FROM draft_sets) AS sets`,
  );
  return changes!;
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
export async function deployDraftUnits(db: Db, studyId: number, deploy: number): Promise<void> {
  await lockUnits(db, studyId, "write");
  // Added or changed units (with the version they replace, if any), and removed ones
  const changed = await rows<{ unitId: number; versionId: number | null }>(
    db,
    sql`WITH ${content(studyId)}
    SELECT d.unit_id AS "unitId", l.version_id AS "versionId" FROM draft d LEFT JOIN live l ON l.unit_id = d.unit_id
    WHERE l.unit_id IS NULL OR l.content <> d.content
    UNION ALL
    SELECT l.unit_id, l.version_id FROM live l WHERE NOT EXISTS (SELECT 1 FROM draft d WHERE d.unit_id = l.unit_id)`,
  );
  const closing = changed.flatMap((c) => (c.versionId === null ? [] : [c.versionId]));
  if (closing.length > 0) await db.update(unitVersions).set({ toDeploy: deploy - 1 }).where(anyOf(unitVersions.id, closing));
  // New versions of the added and changed units, with the draft's fields
  const opening = await rows<{ id: number }>(
    db,
    sql`INSERT INTO unit_versions (study_id, unit_id, from_deploy)
    SELECT ${studyId}, u.id, ${deploy} FROM units u WHERE ${anyOf(sql`u.id`, changed.map((c) => c.unitId))} AND u.in_draft
    RETURNING id`,
  );
  if (opening.length > 0) {
    await db.execute(sql`
      INSERT INTO unit_version_fields (version_id, field_id, value_id)
      SELECT v.id, d.field_id, d.value_id FROM unit_versions v JOIN unit_draft d ON d.unit_id = v.unit_id
      WHERE ${anyOf(sql`v.id`, opening.map((o) => o.id))}`);
  }
  // The draft's sets become the live ones
  await db.delete(unitSets).where(and(eq(unitSets.studyId, studyId), eq(unitSets.live, true)));
  await db.execute(sql`
    WITH copied AS (
      INSERT INTO unit_sets (study_id, live, grp, name)
      SELECT study_id, true, grp, name FROM unit_sets WHERE study_id = ${studyId} AND NOT live
      RETURNING id, grp, name
    )
    INSERT INTO unit_set_members (set_id, unit_id, position)
    SELECT c.id, m.unit_id, m.position FROM copied c
    JOIN unit_sets s ON s.study_id = ${studyId} AND NOT s.live AND s.grp = c.grp AND s.name = c.name
    JOIN unit_set_members m ON m.set_id = s.id`);
  // Replaced versions nobody coded, units nothing keeps, values nothing refers to
  await db
    .delete(unitVersions)
    .where(
      and(
        eq(unitVersions.studyId, studyId),
        isNotNull(unitVersions.toDeploy),
        notExists(db.select({ one: sql`1` }).from(annotationValues).where(eq(annotationValues.unitVersionId, unitVersions.id))),
      ),
    );
  await db
    .delete(units)
    .where(
      and(
        eq(units.studyId, studyId),
        eq(units.inDraft, false),
        eq(units.coded, false),
        notExists(db.select({ one: sql`1` }).from(unitVersions).where(eq(unitVersions.unitId, units.id))),
      ),
    );
  await deleteUnusedValues(db, studyId);
}

/** A unit as coders get it: deployed (its current version), or (a preview) the draft. */
export interface ServedUnitRow {
  id: number;
  externalId: string;
  /** The current version (0 for a draft: previews keep nothing). */
  versionId: number;
  hash: string;
  data: UnitData;
}

/** Units as coders get them, by id: the current versions (`live`), or the drafts (previews). */
export async function servedUnits(db: Db, studyId: number, live: boolean, ids: number[]): Promise<ServedUnitRow[]> {
  if (!live) return (await draftUnits(db, studyId, { ids })).map((r) => ({ ...r, versionId: 0 }));
  const t = db
    .select({ id: units.id, externalId: units.externalId, versionId: sql<number>`${unitVersions.id}`.as("version_id"), data: unitVersionData(unitVersions.id).as("data") })
    .from(units)
    .innerJoin(unitVersions, and(eq(unitVersions.unitId, units.id), isNull(unitVersions.toDeploy)))
    .where(and(eq(units.studyId, studyId), anyOf(units.id, ids)))
    .as("t");
  return db.select({ id: t.id, externalId: t.externalId, versionId: t.versionId, data: t.data, hash: unitDataHash(t.data) }).from(t);
}

/** The ids of a study's units: the deployed ones (with a current version, `live`) or the draft's. */
export async function unitIds(db: Db, studyId: number, live: boolean): Promise<number[]> {
  const found = live
    ? await db
        .selectDistinct({ id: unitVersions.unitId })
        .from(unitVersions)
        .where(and(eq(unitVersions.studyId, studyId), isNull(unitVersions.toDeploy)))
        .orderBy(asc(unitVersions.unitId))
    : await db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.studyId, studyId), eq(units.inDraft, true)))
        .orderBy(asc(units.id));
  return found.map((r) => r.id);
}

