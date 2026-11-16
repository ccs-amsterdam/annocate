-- The second factor comes from the login provider (the lab's Authentication
-- standard, docs/security.md): AnnoTinder's own passkeys and recovery codes go.
DROP TABLE recovery_codes;
DROP TABLE passkeys;

-- A session's second factor (mfa: the login used one): when the login
-- provider authenticated the user with it (auth_time). Sensitive actions
-- need it recent (step-up). issuer: the provider the login came from.
ALTER TABLE sessions ADD COLUMN auth_time TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN issuer TEXT NOT NULL DEFAULT '';

-- API keys are made only in a session with a recent second factor, and never
-- do sensitive actions: they need no flag of their own.
ALTER TABLE api_keys DROP COLUMN mfa;
