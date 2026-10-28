-- The deletion log: coders whose data was deleted. Kept after the data is
-- gone, with the identifiers downloaded results use, so researchers can
-- delete them there too. A coder's deletion_request is now { at,
-- postponedAt? } (the researcher deletes later).
CREATE TABLE coder_deletions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL,
  participant_id TEXT,
  email TEXT,
  requested_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by TEXT,
  answers INTEGER NOT NULL
);
CREATE INDEX coder_deletions_job ON coder_deletions (job_id, deleted_at);
