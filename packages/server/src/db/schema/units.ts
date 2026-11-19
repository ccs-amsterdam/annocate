import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { bytea, timestamptz } from "./columns.js";
import { studies } from "./studies.js";

// Units (docs/architecture.md §8.4): a draft, versions made by deploys, sets.
// A unit's data is field name -> value; names and values are stored once per
// study and referred to by id.

/** Field names, numbered per study, so the field rows stay small. */
export const unitFieldNames = pgTable(
  "unit_field_names",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    name: text().notNull(),
  },
  (t) => [unique("unit_field_names_study_id_name_key").on(t.studyId, t.name)],
);

/** Every field value once per study (hash: sha256 of its JSON, `unitValueHash`). Values nothing refers to any more are deleted. */
export const unitValues = pgTable(
  "unit_values",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    hash: bytea().notNull(),
    value: jsonb().notNull(),
  },
  (t) => [unique("unit_values_study_id_hash_key").on(t.studyId, t.hash)],
);

/**
 * Units: the things coders code, by the researcher's id (external_id).
 * in_draft: in the draft (removed units stay while versions or answers refer
 * to them); coded: answered, so never deleted.
 */
export const units = pgTable(
  "units",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    externalId: text().notNull(),
    inDraft: boolean().notNull().default(true),
    coded: boolean().notNull().default(false),
  },
  (t) => [unique("units_study_id_external_id_key").on(t.studyId, t.externalId)],
);

/** Each unit's working copy, field -> value: overwritten freely. */
export const unitDraft = pgTable(
  "unit_draft",
  {
    unitId: integer()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    fieldId: integer()
      .notNull()
      .references(() => unitFieldNames.id, { onDelete: "cascade" }),
    valueId: integer()
      .notNull()
      .references(() => unitValues.id),
  },
  (t) => [
    primaryKey({ name: "unit_draft_pkey", columns: [t.unitId, t.fieldId] }),
    index("unit_draft_value").on(t.valueId),
  ],
);

/**
 * What deploys gave coders: a version is current from deploy from_deploy
 * until to_deploy (NULL: still current). A replaced version no answer refers
 * to is deleted.
 */
export const unitVersions = pgTable(
  "unit_versions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    unitId: integer()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    fromDeploy: integer().notNull(),
    toDeploy: integer(),
    created: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("unit_versions_current")
      .on(t.unitId)
      .where(sql`${t.toDeploy} IS NULL`),
  ],
);

/** A unit version's fields, field -> value. */
export const unitVersionFields = pgTable(
  "unit_version_fields",
  {
    versionId: integer()
      .notNull()
      .references(() => unitVersions.id, { onDelete: "cascade" }),
    fieldId: integer()
      .notNull()
      .references(() => unitFieldNames.id, { onDelete: "cascade" }),
    valueId: integer()
      .notNull()
      .references(() => unitValues.id),
  },
  (t) => [
    primaryKey({ name: "unit_version_fields_pkey", columns: [t.versionId, t.fieldId] }),
    index("unit_version_fields_value").on(t.valueId),
  ],
);

/** Sets of units in set groups (grp: a `set` column), the draft's and the deployed ones (live); no history. */
export const unitSets = pgTable(
  "unit_sets",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    live: boolean().notNull(),
    grp: text().notNull(),
    name: text().notNull(),
  },
  (t) => [unique("unit_sets_study_id_live_grp_name_key").on(t.studyId, t.live, t.grp, t.name)],
);

/** A set's units; position NULL: the set is in the units' order. */
export const unitSetMembers = pgTable(
  "unit_set_members",
  {
    setId: integer()
      .notNull()
      .references(() => unitSets.id, { onDelete: "cascade" }),
    unitId: integer()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    position: integer(),
  },
  (t) => [
    primaryKey({ name: "unit_set_members_pkey", columns: [t.setId, t.unitId] }),
    index("unit_set_members_unit").on(t.unitId),
  ],
);
