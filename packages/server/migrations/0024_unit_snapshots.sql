-- Units as drafts and deployed snapshots (docs/plans/design.md §5).
--
-- Field values are stored once per job by content (`unit_values`); a unit
-- version is a map of field -> value id (`unit_versions.fields`). `units`
-- is the draft: each unit's current version (NULL: removed from the draft,
-- kept for the snapshots and answers that use it). A deployment runs a
-- codebook with a unit snapshot (`unit_snapshots`, `snapshot_units`,
-- `snapshot_sets`); `unit_sets` is the draft's sets.

-- A value's hash, and a unit's content hash (over field names and value hashes).
CREATE FUNCTION unit_value_hash(value JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(value::text)
$$;
CREATE FUNCTION unit_content_hash(data JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(COALESCE((SELECT jsonb_object_agg(key, unit_value_hash(value)) FROM jsonb_each(data)), '{}'::jsonb)::text)
$$;

CREATE TABLE unit_values (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  value JSONB NOT NULL,
  UNIQUE (job_id, hash)
);

-- A unit's data from its version's fields.
CREATE FUNCTION unit_data(fields JSONB) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(f.key, v.value), '{}'::jsonb)
  FROM jsonb_each_text(fields) f JOIN unit_values v ON v.id = f.value::int
$$;
-- The value ids of a unit's data (its values must be stored).
CREATE FUNCTION unit_value_ids(job INTEGER, data JSONB) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(e.key, v.id), '{}'::jsonb)
  FROM jsonb_each(data) e JOIN unit_values v ON v.job_id = job AND v.hash = unit_value_hash(e.value)
$$;

-- Existing versions (the fields coders were shown) and units become value maps.
INSERT INTO unit_values (job_id, hash, value)
SELECT DISTINCT s.job_id, unit_value_hash(e.value), e.value
FROM (SELECT job_id, data FROM unit_versions UNION ALL SELECT job_id, data FROM units) s, jsonb_each(s.data) e
ON CONFLICT DO NOTHING;

ALTER TABLE unit_versions ADD COLUMN fields JSONB;
ALTER TABLE unit_versions ALTER COLUMN data DROP NOT NULL;
UPDATE unit_versions SET fields = unit_value_ids(job_id, data), hash = unit_content_hash(data);

INSERT INTO unit_versions (job_id, unit_id, hash, fields)
SELECT job_id, id, unit_content_hash(data), unit_value_ids(job_id, data) FROM units
ON CONFLICT (unit_id, hash) DO NOTHING;

ALTER TABLE units ADD COLUMN version_id INTEGER REFERENCES unit_versions (id);
UPDATE units u SET version_id = (SELECT v.id FROM unit_versions v WHERE v.unit_id = u.id AND v.hash = unit_content_hash(u.data));
ALTER TABLE units DROP COLUMN data;
ALTER TABLE unit_versions DROP COLUMN data;
ALTER TABLE unit_versions ALTER COLUMN fields SET NOT NULL;

-- Deployed units: which version of which unit, and the sets.
CREATE TABLE unit_snapshots (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE snapshot_units (
  snapshot_id INTEGER NOT NULL REFERENCES unit_snapshots (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id),
  version_id INTEGER NOT NULL REFERENCES unit_versions (id),
  PRIMARY KEY (snapshot_id, unit_id)
);
CREATE INDEX snapshot_units_unit ON snapshot_units (unit_id);
CREATE TABLE snapshot_sets (
  snapshot_id INTEGER NOT NULL REFERENCES unit_snapshots (id) ON DELETE CASCADE,
  grp TEXT NOT NULL,
  set_name TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units (id),
  position INTEGER,
  PRIMARY KEY (snapshot_id, grp, set_name, unit_id)
);

ALTER TABLE deployments ADD COLUMN snapshot_id INTEGER REFERENCES unit_snapshots (id);
INSERT INTO unit_snapshots (job_id) SELECT job_id FROM deployments;
UPDATE deployments d SET snapshot_id = (SELECT s.id FROM unit_snapshots s WHERE s.job_id = d.job_id);
INSERT INTO snapshot_units (snapshot_id, unit_id, version_id)
SELECT d.snapshot_id, u.id, u.version_id FROM deployments d JOIN units u ON u.job_id = d.job_id;
INSERT INTO snapshot_sets (snapshot_id, grp, set_name, unit_id, position)
SELECT d.snapshot_id, s.grp, s.set_name, s.unit_id, s.position FROM deployments d JOIN unit_sets s ON s.job_id = d.job_id;
ALTER TABLE deployments ALTER COLUMN snapshot_id SET NOT NULL;

-- Deployed versions, in order: what each changed.
CREATE TABLE deployment_versions (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  codebook_id INTEGER NOT NULL REFERENCES codebooks (id),
  snapshot_id INTEGER NOT NULL REFERENCES unit_snapshots (id),
  changes JSONB NOT NULL, -- contracts DeploymentChanges
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, version)
);
INSERT INTO deployment_versions (job_id, version, codebook_id, snapshot_id, changes, created)
SELECT job_id, version, codebook_id, snapshot_id, '{"codebook": true, "units": null}', updated FROM deployments;
