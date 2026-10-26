-- Researchers (users) and their API keys. A user's role in a job is in
-- job_users, by email.

CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Personal API keys, for scripts and other systems. Only a hash is stored;
-- the key is shown once, when it is created.
CREATE TABLE api_keys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- sha256 of the key, hex
  prefix TEXT NOT NULL, -- the key's first characters, to recognize it
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX api_keys_user ON api_keys (user_id);
