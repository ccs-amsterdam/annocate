-- The data model (Postgres). Applied in order by src/db.ts; a change is a
-- new numbered file, never an edit to an applied one.
--
-- The server hosts any number of jobs; everything else belongs to one job.

CREATE TABLE jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Researchers with access to a job (researcher API only).
CREATE TABLE job_users (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL, -- READ | WRITE | ADMIN
  PRIMARY KEY (job_id, email)
);

-- Codebook versions. A deployed codebook becomes immutable: coders' answers
-- refer to it.
CREATE TABLE codebooks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  note TEXT,
  items JSONB NOT NULL, -- CodebookItem[] (contracts codebook/)
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  immutable BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX codebooks_job ON codebooks (job_id);

-- Units: the things coders code. A unit becomes immutable once annotated.
CREATE TABLE units (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- the researcher's own id, unique per job
  data JSONB NOT NULL, -- field name -> value
  immutable BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (job_id, external_id)
);

-- The job's unit fields (contracts unitFields.ts): set by the first upload,
-- every later unit must fit them. Cleared when the last unit is deleted.
CREATE TABLE unit_fields (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (job_id, name)
);

-- Named, ordered selections of units, used by the codebook's unit loops.
CREATE TABLE unitsets (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_ids INTEGER[] NOT NULL -- units.id, in order
);
CREATE INDEX unitsets_job ON unitsets (job_id);

-- Invite links: how coders join a job (docs/coder-identity.md).
CREATE TABLE invites (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  auth TEXT NOT NULL, -- none | optional | required
  secret TEXT NOT NULL UNIQUE,
  emails JSONB, -- string[]
  max_uses INTEGER, -- NULL: unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  variables JSONB NOT NULL DEFAULT '{}', -- preset values for `auto` variables
  participant_id TEXT, -- a fixed participant id for every coder of this invite
  participant_from_url BOOLEAN NOT NULL DEFAULT false, -- or: take it from the link
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ -- revoked: no new coders
);

-- Coders: one per session (coder_key is a hash of the session key, see
-- src/runtime/session.ts). Coder-level values (answers outside unit loops)
-- and loop assignments are kept here, written as a whole by the runtime.
CREATE TABLE coders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_key TEXT NOT NULL UNIQUE,
  email TEXT,
  participant_id TEXT, -- a label, never a credential
  invite_id INTEGER, -- invites.id: the invite they joined with
  variables JSONB NOT NULL DEFAULT '{}', -- variable -> VariableValue
  assignments JSONB NOT NULL DEFAULT '{}', -- loop -> assigned unitset names
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coders_participant ON coders (job_id, participant_id);

-- Answers: one row per (unit, coder, variable). Rows are retired
-- (retired_at), never deleted; only live rows count, and only those must
-- be unique.
CREATE TABLE annotation_values (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL, -- units.id
  coder_id INTEGER NOT NULL, -- coders.id
  variable TEXT NOT NULL,
  value JSONB NOT NULL, -- VariableValue
  codebook_id INTEGER, -- codebooks.id: the version the coder answered
  -- Only set when the coder was shown other content than the unit has now;
  -- NULL means "the current content". Units become immutable once
  -- annotated, so NULL stays true.
  unit_hash TEXT,
  created TIMESTAMPTZ NOT NULL,
  updated TIMESTAMPTZ NOT NULL,
  retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX annotation_values_live ON annotation_values (unit_id, coder_id, variable) WHERE retired_at IS NULL;
CREATE INDEX annotation_values_coder ON annotation_values (job_id, coder_id, unit_id);
CREATE INDEX annotation_values_variable ON annotation_values (job_id, variable);
CREATE INDEX annotation_values_created ON annotation_values (job_id, created);

-- A job's deployment: which codebook coders get. At most one per job.
CREATE TABLE deployments (
  job_id INTEGER PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  codebook_id INTEGER NOT NULL, -- codebooks.id
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL, -- bumped on every change, so the runtime reloads
  annotation_epoch INTEGER NOT NULL DEFAULT 0, -- bumped on resets, idem
  updated TIMESTAMPTZ NOT NULL
);
