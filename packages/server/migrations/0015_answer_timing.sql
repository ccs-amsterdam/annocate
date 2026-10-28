-- Response times (docs/coder-identity.md §10): per answer, how long the
-- coder took as their browser measured it (AnswerTiming), and per coder and
-- unit when the server first handed the unit out: the server's own bound
-- on the time spent, against which the browser's can be checked.
ALTER TABLE annotation_values ADD COLUMN timing JSONB;

CREATE TABLE unit_serves (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL,
  first_served TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coder_id, unit_id)
);
