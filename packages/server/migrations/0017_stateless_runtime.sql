-- A server without per-coder state in memory (docs/architecture.md §3).

-- Bumped whenever something the coder runtime reads changes (units,
-- unitsets, job settings, resets; a new codebook bumps `version`): every
-- server process checks it per request and re-reads the deployment.
ALTER TABLE deployments ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

-- The unit version last shown to the coder: stored with their answers.
ALTER TABLE unit_serves ADD COLUMN unit_version_id INTEGER REFERENCES unit_versions (id) ON DELETE SET NULL;

-- "Continue on another device" links: used once, valid for minutes.
CREATE TABLE transfers (
  token_hash TEXT PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  participant TEXT,
  expires TIMESTAMPTZ NOT NULL
);
