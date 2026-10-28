-- Unit distribution in the database (docs/plan-stateless-runtime.md, steps
-- 3-4), so any number of server processes can hand out units.

-- Finished codings per unit loop: a unit is finished in a loop when the
-- coder answered every question of the loop (docs/architecture.md §8.2).
-- Derived from annotation_values, written with the answers; rebuilt when
-- what "finished" means changes (deployments.codings_basis).
CREATE TABLE unit_codings (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  loop_key TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  -- The coder's answers to the loop's agreement questions (agreementKey).
  agreement JSONB NOT NULL DEFAULT '{}',
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, loop_key, unit_id, coder_id)
);
CREATE INDEX unit_codings_coder ON unit_codings (coder_id, loop_key, created);

-- The codebook's loops (codingsSignature) and annotation epoch unit_codings were derived under.
ALTER TABLE deployments ADD COLUMN codings_basis TEXT;

-- Shared queues: a unit handed out to a coder is reserved for a while; one per coder per queue.
CREATE TABLE unit_leases (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  loop_key TEXT NOT NULL,
  unitset TEXT NOT NULL,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (job_id, loop_key, unitset, coder_id)
);
