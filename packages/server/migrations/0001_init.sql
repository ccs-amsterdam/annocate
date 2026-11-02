-- AnnoTinder's data model (Postgres; PGlite in development and tests).
--
-- Applied by src/db.ts: each file in this directory once, in order, in a
-- transaction (schema_migrations). From the first release on, a change is a
-- new numbered file that only adds to this; an applied file is never edited.
--
-- The server hosts any number of jobs; almost everything belongs to one job
-- and goes with it (ON DELETE CASCADE). Terms: docs/glossary.md; the model:
-- docs/architecture.md.

-- =============================================================================
-- Accounts and the server (docs/accounts.md, docs/security.md)
-- =============================================================================

-- Plans: limits on what researchers may create (jobs, units, coders, ...).
CREATE TABLE plans (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  limits JSONB NOT NULL DEFAULT '{}'
);

-- People who log in (researchers, admins; coders don't need an account).
-- role: what they may do on the server; plan_id and limits override the
-- default plan for them; blocked_at: no access.
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'researcher', 'admin')),
  plan_id INTEGER REFERENCES plans (id) ON DELETE SET NULL,
  limits JSONB NOT NULL DEFAULT '{}',
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ
);

-- The server's settings: one row. registration: { open, requests }; the
-- default plan; the most a unit's data (unit_bytes) or one answer
-- (answer_bytes) may take.
CREATE TABLE server_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  registration JSONB NOT NULL DEFAULT '{"open": false, "requests": true}',
  default_plan_id INTEGER REFERENCES plans (id),
  unit_bytes INTEGER NOT NULL DEFAULT 262144,
  answer_bytes INTEGER NOT NULL DEFAULT 65536
);

-- Email domains that make new users researchers (and give them a plan).
CREATE TABLE domain_rules (
  domain TEXT PRIMARY KEY,
  researcher BOOLEAN NOT NULL DEFAULT false,
  plan_id INTEGER REFERENCES plans (id) ON DELETE SET NULL
);

-- Invitations to become a researcher (not coders' links): one use each.
CREATE TABLE researcher_invites (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  secret TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  plan_id INTEGER REFERENCES plans (id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires TIMESTAMPTZ NOT NULL,
  used_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Users asking for researcher access, and the admin's decision.
CREATE TABLE researcher_requests (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  approved BOOLEAN
);

-- Login sessions (a cookie; key_hash: its hash). mfa: logged in with a second factor.
CREATE TABLE sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  mfa BOOLEAN NOT NULL DEFAULT false,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- API keys for the researcher API (stored as hashes; prefix: to recognize
-- one). mfa: made with a second factor (or by the server's operator).
CREATE TABLE api_keys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  mfa BOOLEAN NOT NULL DEFAULT false,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX api_keys_user ON api_keys (user_id);

-- Passkeys (ANNOTINDER_2FA=annotinder), and one-time recovery codes.
CREATE TABLE passkeys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ
);
CREATE INDEX passkeys_user ON passkeys (user_id);

CREATE TABLE recovery_codes (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, code_hash)
);

-- What happened to a user's security (second factor added, recovery used, ...).
CREATE TABLE security_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX security_log_user ON security_log (user_id, at);

-- What admins did (by email: kept when the admin's account goes).
CREATE TABLE admin_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'
);

-- Requests per key (an address, an account) and minute (src/shared/rateLimit.ts).
-- Unlogged: losing it in a crash only resets the counts.
CREATE UNLOGGED TABLE rate_limits (
  key TEXT NOT NULL,
  minute TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, minute)
);

-- =============================================================================
-- Jobs: the design, its deployments, links
-- =============================================================================

-- A job. owner_id: who created it (counts against their plan); origin: an
-- example or recipe it came from; keep_sessions_open: coders' sessions
-- aren't closed when they finish; redirect_urls: panel return links by
-- setting name (deployment settings); suspended_at: blocked by an admin.
CREATE TABLE jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  origin TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  keep_sessions_open BOOLEAN NOT NULL DEFAULT false,
  redirect_urls JSONB NOT NULL DEFAULT '{}',
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at TIMESTAMPTZ
);

-- Researchers with access to a job, and their role on it.
CREATE TABLE job_users (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (job_id, email)
);

-- Design versions (docs/plans/design.md): the questions and their order
-- (items), the session (link and URL parameters), the declared unit fields
-- (units). Drafts are saved freely (revision: bumped on every save, for
-- conflicts); a deployed version becomes immutable: answers refer to it.
CREATE TABLE design_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  note TEXT,
  items JSONB NOT NULL,
  session JSONB,
  units JSONB NOT NULL DEFAULT '{"fields": []}',
  immutable BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 1,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
CREATE INDEX design_versions_job ON design_versions (job_id);

-- A job's deployment: the design version coders get now. At most one per
-- job. version: bumped per deploy (unit versions name deploys by it);
-- annotation_epoch: bumped when answers are reset; revision: bumped on any
-- change coders' sessions must notice; codings_basis: what the stored
-- codings (unit_codings) were counted under.
CREATE TABLE deployments (
  job_id INTEGER PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  design_version_id INTEGER NOT NULL REFERENCES design_versions (id),
  version INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  annotation_epoch INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  codings_basis TEXT,
  updated TIMESTAMPTZ NOT NULL
);

-- Each deploy: its design version, what it changed, and the client (release
-- and commit) it ran on (docs/plans/design-viewer.md §1).
CREATE TABLE deployment_versions (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  design_version_id INTEGER NOT NULL REFERENCES design_versions (id),
  changes JSONB NOT NULL,
  client_release TEXT,
  client_commit TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, version)
);

-- Links: how coders join a job (docs/coder-identity.md). Made from the
-- design's link parameters (params; link_key: which combination), so a
-- deploy keeps, adds and retires them. auth: who may use one (anyone, by
-- email list, ...); max_uses / uses: a sample size per link.
CREATE TABLE links (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  secret TEXT NOT NULL UNIQUE,
  auth TEXT NOT NULL,
  emails JSONB,
  participant_id TEXT,
  params JSONB NOT NULL DEFAULT '{}',
  link_key TEXT NOT NULL DEFAULT '[]',
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ
);
CREATE INDEX links_job_key ON links (job_id, link_key);

-- =============================================================================
-- Units (docs/plans/design.md §5): a draft, versions made by deploys, sets
-- =============================================================================

-- Field names, numbered per job, so the field rows stay small.
CREATE TABLE unit_field_names (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (job_id, name)
);

-- Every field value once per job (hash: sha256 of its JSON, unit_value_hash).
-- Values nothing refers to any more are deleted.
CREATE TABLE unit_values (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  hash BYTEA NOT NULL,
  value JSONB NOT NULL,
  UNIQUE (job_id, hash)
);

-- Units: the things coders code, by the researcher's id (external_id).
-- in_draft: in the draft (removed units stay while versions or answers
-- refer to them); coded: answered, so never deleted.
CREATE TABLE units (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  in_draft BOOLEAN NOT NULL DEFAULT true,
  coded BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (job_id, external_id)
);

-- Each unit's working copy, field -> value: overwritten freely.
CREATE TABLE unit_draft (
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES unit_field_names (id) ON DELETE CASCADE,
  value_id INTEGER NOT NULL REFERENCES unit_values (id),
  PRIMARY KEY (unit_id, field_id)
);
CREATE INDEX unit_draft_value ON unit_draft (value_id);

-- What deploys gave coders: a version is current from deploy from_deploy
-- until to_deploy (NULL: still current). A replaced version no answer
-- refers to is deleted; deploy 0: answered before deploys were recorded.
CREATE TABLE unit_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  from_deploy INTEGER NOT NULL,
  to_deploy INTEGER,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX unit_versions_current ON unit_versions (unit_id) WHERE to_deploy IS NULL;

CREATE TABLE unit_version_fields (
  version_id INTEGER NOT NULL REFERENCES unit_versions (id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES unit_field_names (id) ON DELETE CASCADE,
  value_id INTEGER NOT NULL REFERENCES unit_values (id),
  PRIMARY KEY (version_id, field_id)
);
CREATE INDEX unit_version_fields_value ON unit_version_fields (value_id);

-- Sets of units in set groups (grp), the draft's and the deployed ones
-- (live); no history (coders' routing records their set).
CREATE TABLE unit_sets (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  live BOOLEAN NOT NULL,
  grp TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (job_id, live, grp, name)
);

-- A set's units; position NULL: the set is in the units' order.
CREATE TABLE unit_set_members (
  set_id INTEGER NOT NULL REFERENCES unit_sets (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  position INTEGER,
  PRIMARY KEY (set_id, unit_id)
);
CREATE INDEX unit_set_members_unit ON unit_set_members (unit_id);

-- A unit's data: its draft, or a version (field name -> value).
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

-- A value's hash (unit_values.hash), and a unit's data's hash (as text: what clients compare).
CREATE FUNCTION unit_value_hash(value JSONB) RETURNS BYTEA LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to(value::text, 'UTF8'))
$$;

CREATE FUNCTION unit_data_hash(data JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(data::text, 'UTF8')), 'hex')
$$;

-- =============================================================================
-- Coders and their answers
-- =============================================================================

-- Coders: one per session of a job (docs/coder-identity.md). link_id: the
-- link they came with; session: its parameter values; assignments: per
-- loop, the branch and set they were routed to; ended: how the session
-- ended; deletion_request: they asked for their answers to be deleted.
CREATE TABLE coders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  link_id INTEGER REFERENCES links (id),
  email TEXT,
  participant_id TEXT,
  session JSONB NOT NULL DEFAULT '{}',
  assignments JSONB NOT NULL DEFAULT '{}',
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended JSONB,
  deletion_request JSONB
);
CREATE INDEX coders_participant ON coders (job_id, participant_id);
CREATE INDEX coders_email ON coders (job_id, lower(email));

-- A coder's devices (a cookie; key_hash: its hash), with coarse details.
CREATE TABLE coder_devices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coder_devices_coder ON coder_devices (coder_id);

-- Coders whose data was deleted: who and when (no foreign key: the coder is gone).
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

-- Continuing a session on another device: a short-lived token.
CREATE TABLE transfers (
  token_hash TEXT PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  participant TEXT,
  expires TIMESTAMPTZ NOT NULL
);

-- Answers: one row per (unit, coder, question); unit_id NULL: a coder-level
-- answer (outside unit loops). Reset answers are retired (retired_at), never
-- deleted; only live rows count, and only those are unique. With the design
-- version and unit version the coder answered under, the device, the
-- browser's timing; assigned: set by the server (auto questions); frozen:
-- units were coded with it, so it can't change.
CREATE TABLE annotation_values (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units (id),
  unit_version_id INTEGER REFERENCES unit_versions (id),
  design_version_id INTEGER REFERENCES design_versions (id),
  device_id INTEGER REFERENCES coder_devices (id) ON DELETE SET NULL,
  variable TEXT NOT NULL,
  value JSONB NOT NULL,
  timing JSONB,
  assigned BOOLEAN NOT NULL DEFAULT false,
  frozen BOOLEAN NOT NULL DEFAULT false,
  created TIMESTAMPTZ NOT NULL,
  updated TIMESTAMPTZ NOT NULL,
  retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX annotation_values_live ON annotation_values (unit_id, coder_id, variable) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX annotation_values_coder_live ON annotation_values (coder_id, variable) WHERE retired_at IS NULL AND unit_id IS NULL;
CREATE INDEX annotation_values_coder ON annotation_values (job_id, coder_id, unit_id);
CREATE INDEX annotation_values_variable ON annotation_values (job_id, variable);
CREATE INDEX annotation_values_created ON annotation_values (job_id, created);

-- =============================================================================
-- Distribution (docs/architecture.md §8): what the runtime needs to hand
-- out units across server processes
-- =============================================================================

-- When a unit was first handed to a coder, and the version they got (the
-- server's bound on response times; which version they saw).
CREATE TABLE unit_serves (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  unit_version_id INTEGER REFERENCES unit_versions (id) ON DELETE SET NULL,
  first_served TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coder_id, unit_id)
);

-- Finished units per loop and coder, with what counts for agreement
-- (shared queues: until coders agree).
CREATE TABLE unit_codings (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  loop_key TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  agreement JSONB NOT NULL DEFAULT '{}',
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, loop_key, unit_id, coder_id)
);
CREATE INDEX unit_codings_coder ON unit_codings (coder_id, loop_key, created);

-- Units of a shared queue handed out to a coder, until they expire.
CREATE TABLE unit_leases (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  loop_key TEXT NOT NULL,
  set_name TEXT NOT NULL,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (job_id, loop_key, set_name, coder_id, unit_id)
);

-- =============================================================================
-- Seed: the default plan
-- =============================================================================

INSERT INTO plans (name, limits) VALUES
  ('Default', '{"jobs": 20, "unitsPerJob": 50000, "units": 200000, "codersPerJob": 5000, "answersPerJob": 2000000}');
INSERT INTO server_settings (default_plan_id) SELECT id FROM plans WHERE name = 'Default';
