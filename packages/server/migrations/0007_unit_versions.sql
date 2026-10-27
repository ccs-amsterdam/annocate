-- What coders saw (docs/architecture.md §8.4): a unit as shown, i.e. its
-- external id and the fields the codebook uses, stored once per version.
-- Every answer points to the version its coder saw, so changing a unit
-- after it was coded is visible, and what was coded can be restored.
CREATE TABLE unit_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  hash TEXT NOT NULL, -- of the external id and `data`
  data JSONB NOT NULL, -- the fields shown, as shown
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, hash)
);

ALTER TABLE annotation_values DROP COLUMN unit_hash;
ALTER TABLE annotation_values ADD COLUMN unit_version_id INTEGER REFERENCES unit_versions (id);
ALTER TABLE annotation_values ADD FOREIGN KEY (codebook_id) REFERENCES codebooks (id);

-- A unit with answers is no longer frozen: it can be replaced, with a
-- warning (its versions keep what was coded). The flag only says it was coded.
ALTER TABLE units RENAME COLUMN immutable TO coded;
