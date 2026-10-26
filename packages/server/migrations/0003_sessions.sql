-- Researcher sessions after logging in (src/shared/sessions.ts): the
-- browser holds a random key in an httpOnly cookie; only its hash is
-- stored. Coder sessions are separate (coders.coder_key).

CREATE TABLE sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, -- sha256 of the session key, hex
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;
