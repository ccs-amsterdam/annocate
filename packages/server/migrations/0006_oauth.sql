-- AI assistants (MCP clients) connecting to one study (docs/api/mcp.md):
-- AnnoTinder is a small OAuth authorization server for its MCP endpoint.

-- The clients: identified by a Client ID Metadata Document (`client_id` is
-- its https URL; fetched and cached) or registered dynamically (RFC 7591).
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('metadata', 'registered')),
  name TEXT NOT NULL,
  uri TEXT,
  redirect_uris JSONB NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_at TIMESTAMPTZ
);

-- An authorization request waiting for the researcher's consent (the consent page).
CREATE TABLE oauth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT,
  resource TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);

-- What a researcher allowed: one client, one study, some scopes.
CREATE TABLE oauth_grants (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  study_id INTEGER NOT NULL REFERENCES studies (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX oauth_grants_user ON oauth_grants (user_id);

-- A grant's codes and tokens, stored as hashes. A code and a refresh token
-- are used once (`used_at`); using a used refresh token again revokes the grant.
CREATE TABLE oauth_tokens (
  hash TEXT PRIMARY KEY,
  grant_id INTEGER NOT NULL REFERENCES oauth_grants (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('code', 'access', 'refresh')),
  expires TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  -- Codes: what the token request must match
  redirect_uri TEXT,
  code_challenge TEXT
);
CREATE INDEX oauth_tokens_grant ON oauth_tokens (grant_id);
