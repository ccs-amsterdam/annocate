-- Whether an API key was made with a second factor (docs/security.md): a key
-- made without one counts as a login without one when ANNOTINDER_2FA is on.
ALTER TABLE api_keys ADD COLUMN mfa BOOLEAN NOT NULL DEFAULT false;
