-- Units: a draft, and versions made only by deploys (docs/plans/design.md §5).
-- Replaces the snapshots of 0024:
--
-- * unit_values: every field value once per job (sha256 of its JSON).
-- * unit_draft: each unit's working copy, field -> value; overwritten freely.
-- * unit_versions + unit_version_fields: what a deploy gave coders. A deploy
--   that changes a unit closes its current version (to_deploy) and opens a
--   new one from that deployment version; replaced versions no answer
--   points to are deleted. The current version has to_deploy NULL.
-- * unit_sets + unit_set_members: the draft's sets and the deployed ones
--   (`live`); sets need no history (coders' routing records their set).
-- * Field names are numbered per job (unit_field_names), so the field rows
--   stay small.

CREATE OR REPLACE FUNCTION unit_value_hash(value JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(value::text, 'UTF8')), 'hex')
$$;
UPDATE unit_values SET hash = unit_value_hash(value);
CREATE FUNCTION unit_data_hash(data JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(data::text, 'UTF8')), 'hex')
$$;

CREATE TABLE unit_field_names (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (job_id, name)
);
INSERT INTO unit_field_names (job_id, name)
SELECT DISTINCT v.job_id, f.key FROM unit_versions v, jsonb_each(v.fields) f;

-- The draft
ALTER TABLE units ADD COLUMN in_draft BOOLEAN NOT NULL DEFAULT true;
UPDATE units SET in_draft = version_id IS NOT NULL;
CREATE TABLE unit_draft (
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES unit_field_names (id) ON DELETE CASCADE,
  value_id INTEGER NOT NULL REFERENCES unit_values (id),
  PRIMARY KEY (unit_id, field_id)
);
CREATE INDEX unit_draft_value ON unit_draft (value_id);
INSERT INTO unit_draft (unit_id, field_id, value_id)
SELECT u.id, n.id, (f.value #>> '{}')::int
FROM units u JOIN unit_versions v ON v.id = u.version_id, jsonb_each(v.fields) f
JOIN unit_field_names n ON n.name = f.key
WHERE n.job_id = u.job_id;

-- Versions: the deployed snapshot's are current; others only if answers point to them
ALTER TABLE unit_versions ADD COLUMN from_deploy INTEGER;
ALTER TABLE unit_versions ADD COLUMN to_deploy INTEGER;
UPDATE unit_versions v SET from_deploy = d.version
FROM deployments d JOIN snapshot_units s ON s.snapshot_id = d.snapshot_id
WHERE s.version_id = v.id;
DELETE FROM unit_versions v
WHERE v.from_deploy IS NULL AND NOT EXISTS (SELECT 1 FROM annotation_values a WHERE a.unit_version_id = v.id);
-- Answered versions from before deploys were recorded: deployment 0
UPDATE unit_versions SET from_deploy = 0, to_deploy = 0 WHERE from_deploy IS NULL;
ALTER TABLE unit_versions ALTER COLUMN from_deploy SET NOT NULL;
CREATE INDEX unit_versions_current ON unit_versions (unit_id) WHERE to_deploy IS NULL;

CREATE TABLE unit_version_fields (
  version_id INTEGER NOT NULL REFERENCES unit_versions (id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES unit_field_names (id) ON DELETE CASCADE,
  value_id INTEGER NOT NULL REFERENCES unit_values (id),
  PRIMARY KEY (version_id, field_id)
);
CREATE INDEX unit_version_fields_value ON unit_version_fields (value_id);
INSERT INTO unit_version_fields (version_id, field_id, value_id)
SELECT v.id, n.id, (f.value #>> '{}')::int
FROM unit_versions v, jsonb_each(v.fields) f
JOIN unit_field_names n ON n.name = f.key
WHERE n.job_id = v.job_id;

-- Sets: the draft's and the deployed ones
CREATE TABLE unit_set_list (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  live BOOLEAN NOT NULL,
  grp TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (job_id, live, grp, name)
);
CREATE TABLE unit_set_members (
  set_id INTEGER NOT NULL REFERENCES unit_set_list (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  position INTEGER, -- NULL: the set is in the units' order
  PRIMARY KEY (set_id, unit_id)
);
CREATE INDEX unit_set_members_unit ON unit_set_members (unit_id);
INSERT INTO unit_set_list (job_id, live, grp, name) SELECT DISTINCT job_id, false, grp, set_name FROM unit_sets;
INSERT INTO unit_set_members (set_id, unit_id, position)
SELECT l.id, s.unit_id, s.position FROM unit_sets s JOIN unit_set_list l ON l.job_id = s.job_id AND NOT l.live AND l.grp = s.grp AND l.name = s.set_name;
INSERT INTO unit_set_list (job_id, live, grp, name)
SELECT DISTINCT d.job_id, true, s.grp, s.set_name FROM deployments d JOIN snapshot_sets s ON s.snapshot_id = d.snapshot_id;
INSERT INTO unit_set_members (set_id, unit_id, position)
SELECT l.id, s.unit_id, s.position FROM deployments d JOIN snapshot_sets s ON s.snapshot_id = d.snapshot_id
JOIN unit_set_list l ON l.job_id = d.job_id AND l.live AND l.grp = s.grp AND l.name = s.set_name;
DROP TABLE unit_sets;
ALTER TABLE unit_set_list RENAME TO unit_sets;

-- Units out of the draft without versions or answers are gone
ALTER TABLE deployment_versions DROP COLUMN snapshot_id;
ALTER TABLE deployments DROP COLUMN snapshot_id;
DROP TABLE snapshot_sets;
DROP TABLE snapshot_units;
DROP TABLE unit_snapshots;
ALTER TABLE units DROP COLUMN version_id;
DELETE FROM units u WHERE NOT u.in_draft AND NOT u.coded AND NOT EXISTS (SELECT 1 FROM unit_versions v WHERE v.unit_id = u.id);
ALTER TABLE unit_versions DROP COLUMN fields;
ALTER TABLE unit_versions DROP COLUMN hash;
DROP FUNCTION unit_data(JSONB);
DROP FUNCTION unit_value_ids(INTEGER, JSONB);
DROP FUNCTION unit_content_hash(JSONB);

-- A unit's data: its draft, or a version
CREATE FUNCTION unit_draft_data(unit INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(n.name, v.value), '{}'::jsonb)
  FROM unit_draft d JOIN unit_field_names n ON n.id = d.field_id JOIN unit_values v ON v.id = d.value_id
  WHERE d.unit_id = unit
$$;
CREATE FUNCTION unit_version_data(version INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(n.name, v.value), '{}'::jsonb)
  FROM unit_version_fields f JOIN unit_field_names n ON n.id = f.field_id JOIN unit_values v ON v.id = f.value_id
  WHERE f.version_id = version
$$;

-- Values nothing refers to any more
DELETE FROM unit_values v
WHERE NOT EXISTS (SELECT 1 FROM unit_draft d WHERE d.value_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM unit_version_fields f WHERE f.value_id = v.id);
