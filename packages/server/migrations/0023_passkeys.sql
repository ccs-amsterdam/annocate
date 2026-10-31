-- Passkeys: the second factor for researcher access when ANNOTINDER_2FA is
-- `annotinder` (docs/security.md "Second factor"). A session confirmed
-- with one has `sessions.mfa` set.
CREATE TABLE passkeys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE, -- base64url
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ
);
CREATE INDEX passkeys_user ON passkeys (user_id);

-- One-time codes to confirm a login without a passkey (a lost device): hashes only.
CREATE TABLE recovery_codes (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, code_hash)
);

-- Per user: passkeys added or removed, recovery codes made or used, resets.
CREATE TABLE security_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX security_log_user ON security_log (user_id, at);
