-- The reference db server's data model (SQLite).
--
-- A db server hosts any number of jobs; everything else belongs to one job.
-- Written for SQLite, but meant to read as plain SQL. SQLite-specific choices:
--   - JSON is stored as TEXT (Postgres: JSONB).
--   - Timestamps are ISO 8601 strings in TEXT (Postgres: TIMESTAMPTZ).
--   - Booleans are INTEGER 0/1 (Postgres: BOOLEAN).
--   - Lists of ids (unitsets.unitIds) are JSON arrays (Postgres: INTEGER[]
--     or a join table).
--
-- There are no migrations: the dev server deletes and recreates its database
-- when this file changes (src/db.ts).

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL
);

-- Researchers with access to a job (researcher API only).
CREATE TABLE job_users (
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL, -- READ | WRITE | ADMIN
  PRIMARY KEY (jobId, email)
);

-- Codebook versions. A deployed codebook becomes immutable: coders' answers
-- refer to it.
CREATE TABLE codebooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  note TEXT,
  items TEXT NOT NULL, -- JSON: CodebookItem[] (contracts codebook/)
  created TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 0
);

-- Units: the things coders code. A unit becomes immutable once annotated.
CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  externalId TEXT NOT NULL, -- the researcher's own id, unique per job
  data TEXT NOT NULL, -- JSON: field name -> value
  immutable INTEGER NOT NULL DEFAULT 0,
  UNIQUE (jobId, externalId)
);

-- The job's unit fields (contracts unitFields.ts): set by the first upload,
-- every later unit must fit them. Cleared when the last unit is deleted.
CREATE TABLE unit_fields (
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (jobId, name)
);

-- Named, ordered selections of units, used by the codebook's unit loops.
CREATE TABLE unitsets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unitIds TEXT NOT NULL -- JSON: units.id[], in order
);

-- Invite links: how coders join a job (docs/coder-identity.md).
CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  auth TEXT NOT NULL, -- none | optional | required
  secret TEXT NOT NULL UNIQUE,
  emails TEXT, -- JSON: string[]
  maxUses INTEGER, -- NULL: unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  variables TEXT NOT NULL DEFAULT '{}', -- JSON: preset values for `auto` variables
  participantId TEXT, -- a fixed participant id for every coder of this invite
  participantFromUrl INTEGER NOT NULL DEFAULT 0, -- or: take it from the link
  created TEXT NOT NULL,
  revokedAt TEXT -- revoked: no new coders
);

-- Coders: one per coder key (a random key their browser keeps). Coder-level
-- values (answers outside unit loops) and loop assignments are kept here as
-- JSON, written as a whole by the job server (annotator API putCoder).
CREATE TABLE coders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coderKey TEXT NOT NULL UNIQUE,
  email TEXT,
  participantId TEXT, -- a label, never a credential
  inviteId INTEGER, -- invites.id: the invite they joined with
  variables TEXT NOT NULL DEFAULT '{}', -- JSON: variable -> VariableValue
  assignments TEXT NOT NULL DEFAULT '{}', -- JSON: loop -> assigned unit ids
  created TEXT NOT NULL
);

-- Answers: one row per (unit, coder, variable). Rows are retired (retiredAt),
-- never deleted; only live rows count, and only those must be unique.
CREATE TABLE annotation_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobId INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  unitId INTEGER NOT NULL, -- units.id
  coderId INTEGER NOT NULL, -- coders.id
  variable TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON: VariableValue
  codebookId INTEGER, -- codebooks.id: the version the coder answered
  -- Only set when the coder was shown other content than the unit has now;
  -- NULL means "the current content". Units become immutable once
  -- annotated, so NULL stays true.
  unitHash TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  retiredAt TEXT
);
CREATE UNIQUE INDEX annotation_values_live ON annotation_values (unitId, coderId, variable) WHERE retiredAt IS NULL;
CREATE INDEX annotation_values_coder ON annotation_values (jobId, coderId, unitId);
CREATE INDEX annotation_values_variable ON annotation_values (jobId, variable);
CREATE INDEX annotation_values_created ON annotation_values (jobId, created);

-- A job's deployment: which codebook coders get. At most one per job.
CREATE TABLE deployments (
  jobId INTEGER PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  codebookId INTEGER NOT NULL, -- codebooks.id
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL, -- bumped on every change, so job servers reload
  annotationEpoch INTEGER NOT NULL DEFAULT 0, -- bumped on resets, idem
  updated TEXT NOT NULL,
  -- The job server this job runs on: only it gets job tokens (plan §13).
  -- NULL: the job server this db server is configured with.
  jobServerUrl TEXT
);
