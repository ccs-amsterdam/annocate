-- Accounts (docs/accounts.md): what a user may do on this server, apart
-- from their roles in jobs (job_users). `user`: code, and work on jobs they
-- were given a role in; `researcher`: also create jobs; `admin`: also
-- manage users, limits and registration. Limits come from plans.

-- Named sets of limits ({ jobs, unitsPerJob, units, codersPerJob,
-- answersPerJob }; a missing or null limit is no limit).
CREATE TABLE plans (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  limits JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO plans (name, limits) VALUES
  ('Default', '{"jobs": 20, "unitsPerJob": 50000, "units": 200000, "codersPerJob": 5000, "answersPerJob": 2000000}');

-- The server's settings: one row. registration: { open, requests }.
-- unit_bytes / answer_bytes: the most a unit's data or one answer may take.
CREATE TABLE server_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  registration JSONB NOT NULL DEFAULT '{"open": false, "requests": true}',
  default_plan_id INTEGER REFERENCES plans (id),
  unit_bytes INTEGER NOT NULL DEFAULT 262144,
  answer_bytes INTEGER NOT NULL DEFAULT 65536
);
INSERT INTO server_settings (default_plan_id) SELECT id FROM plans WHERE name = 'Default';

-- Email domains: users with an address there become researchers
-- (`researcher`), and/or get a plan (e.g. a university's).
-- `domain` is "uni.nl" (that domain) or "*.uni.nl" (its subdomains too).
CREATE TABLE domain_rules (
  domain TEXT PRIMARY KEY,
  researcher BOOLEAN NOT NULL DEFAULT false,
  plan_id INTEGER REFERENCES plans (id) ON DELETE SET NULL
);

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'researcher', 'admin')),
  ADD COLUMN plan_id INTEGER REFERENCES plans (id) ON DELETE SET NULL, -- overrides the default and domain plans
  ADD COLUMN limits JSONB NOT NULL DEFAULT '{}', -- per-limit overrides on top of the plan
  ADD COLUMN blocked_at TIMESTAMPTZ;

-- Links that make whoever logs in with them a researcher (once).
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

-- A user's request to become a researcher; an admin approves or denies it.
CREATE TABLE researcher_requests (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  approved BOOLEAN
);

-- Who owns a job: its limits count against them. Admins can suspend a job.
ALTER TABLE jobs
  ADD COLUMN owner_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN suspended_at TIMESTAMPTZ;

-- What admins did (they can't see job data, but can change accounts and jobs).
CREATE TABLE admin_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'
);

-- Whether a login used a second factor (researcher access may require it).
ALTER TABLE sessions ADD COLUMN mfa BOOLEAN NOT NULL DEFAULT false;
