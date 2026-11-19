import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Hono, type Context } from "hono";
import { MCP_SCOPES, OAuthApproveSchema, type Connection, type McpScope, type OAuthRequestInfo } from "@annotinder/contracts";
import { one, type Sql } from "./db.js";
import type { Env, Server } from "./context.js";
import { checkSensitive, requireResearcher } from "./researcher/auth.js";
import { securityLog } from "./shared/securityLog.js";

// AI assistants connecting to one study (docs/api/mcp.md). AnnoTinder is a
// small OAuth 2.1 authorization server for its own MCP endpoint (mcp.ts),
// following the MCP authorization spec:
//
// - Discovery: `/.well-known/oauth-protected-resource` (RFC 9728) names this
//   server as the authorization server; `/.well-known/oauth-authorization-server`
//   (RFC 8414) its endpoints.
// - Clients: a client ID metadata document (the `client_id` is an https URL
//   we fetch), or dynamic client registration (RFC 7591, `/api/oauth/register`).
//   All clients are public: PKCE (S256) is required, no client secrets.
// - `/api/oauth/authorize` checks the request and sends the browser to the
//   consent page (`/research/connect`): the researcher logs in as usual, and
//   allows the client for one study they may edit (a sensitive action: a
//   recent second factor, step-up). The browser then goes back to the
//   client with a code.
// - `/api/oauth/token`: the code (with the PKCE verifier) for an access
//   token (1 hour) and a refresh token (30 days, rotated on every use; a
//   used one coming back revokes the connection).
// - Tokens are stored as hashes, bound to the user, client, study, scopes
//   and this MCP endpoint (RFC 8707). They work for the MCP endpoint only,
//   never for the researcher API, and only while the user may still edit
//   the study (mcp.ts checks on every request).

const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_S = 30 * 24 * 60 * 60;
const CODE_TTL_S = 5 * 60;
const REQUEST_TTL_S = 10 * 60;
/** How long a fetched client metadata document is trusted. */
const METADATA_TTL_MS = 60 * 60 * 1000;
const METADATA_MAX_BYTES = 64 * 1024;

const PREFIX = { code: "amcp_c_", access: "amcp_a_", refresh: "amcp_r_" } as const;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = (kind: keyof typeof PREFIX) => PREFIX[kind] + randomBytes(32).toString("base64url");

/** Where browsers and clients reach this server: the configured public URL, else the request's origin. */
export function baseUrl(server: Server, c: Context): string {
  return server.login?.publicUrl ?? new URL(c.req.url).origin;
}

/** The MCP endpoint: the resource tokens are for (RFC 8707). */
export const mcpResource = (base: string) => `${base}/api/mcp`;

/** The protected resource metadata URL for the MCP endpoint (RFC 9728, with the resource's path). */
export const resourceMetadataUrl = (base: string) => `${base}/.well-known/oauth-protected-resource/api/mcp`;

// ---- clients -----------------------------------------------------------------

interface ClientRow {
  client_id: string;
  kind: "metadata" | "registered";
  name: string;
  uri: string | null;
  redirect_uris: string[];
  fetched_at: Date | null;
}

const BAD_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);
const isLoopback = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

/**
 * Whether a redirect URI may be registered: https, http on this machine
 * (loopback, for clients on the user's own computer), or an app's own
 * scheme (e.g. `cursor://...`); never a fragment.
 */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return isLoopback(url);
  return !BAD_SCHEMES.has(url.protocol);
}

/** Whether a redirect URI matches a registered one: exactly, except a loopback one's port (RFC 8252 §7.3). */
function redirectMatches(registered: string[], given: string): boolean {
  if (registered.includes(given)) return true;
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !isLoopback(url)) return false;
  return registered.some((r) => {
    try {
      const reg = new URL(r);
      return reg.protocol === "http:" && reg.hostname === url.hostname && reg.pathname === url.pathname && reg.search === url.search;
    } catch {
      return false;
    }
  });
}

/** Whether an address is private, loopback or otherwise not on the public internet. */
function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith("::ffff:")) return privateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/**
 * Fetches a client metadata document, refusing hosts on private networks
 * (the server must not be a way into them). The address is checked before
 * the request; a host that changes its address in between (DNS rebinding)
 * could still slip through, hence the short timeout, no redirects, and the
 * size limit.
 */
export async function fetchPublic(url: string): Promise<Response> {
  const { hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => privateAddress(a.address))) throw new Error("not a public address");
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
}

/** Reads a client metadata document (the `client_id` URL): its name, home page and redirect URIs. */
async function fetchClientMetadata(server: Server, clientId: string): Promise<Omit<ClientRow, "fetched_at" | "kind"> | null> {
  let res: Response;
  try {
    res = await server.fetchClientMetadata(clientId);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = await res.text();
  if (text.length > METADATA_MAX_BYTES) return null;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (doc.client_id !== clientId) return null;
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris : [];
  if (redirectUris.length === 0 || redirectUris.length > 20 || !redirectUris.every(validRedirectUri)) return null;
  const name = typeof doc.client_name === "string" && doc.client_name.trim() ? doc.client_name.trim().slice(0, 200) : new URL(clientId).host;
  const uri = typeof doc.client_uri === "string" && doc.client_uri.startsWith("https://") ? doc.client_uri.slice(0, 500) : null;
  return { client_id: clientId, name, uri, redirect_uris: redirectUris as string[] };
}

/** A client metadata document URL: https, with a path. */
const isMetadataClientId = (clientId: string) => {
  try {
    const url = new URL(clientId);
    return url.protocol === "https:" && url.pathname !== "/" && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
};

/** The client with this id: registered here, or its metadata document (fetched, and again after an hour). */
async function findClient(server: Server, clientId: string): Promise<ClientRow | null> {
  const row = await one<ClientRow>(server.db, "SELECT * FROM oauth_clients WHERE client_id = $1", [clientId]);
  if (row?.kind === "registered") return row;
  if (!isMetadataClientId(clientId)) return null;
  if (row?.fetched_at && Date.now() - new Date(row.fetched_at).getTime() < METADATA_TTL_MS) return row;
  const doc = await fetchClientMetadata(server, clientId);
  if (!doc) return row && row.fetched_at ? row : null;
  return (await one<ClientRow>(
    server.db,
    `INSERT INTO oauth_clients (client_id, kind, name, uri, redirect_uris, fetched_at) VALUES ($1, 'metadata', $2, $3, $4, now())
     ON CONFLICT (client_id) DO UPDATE SET name = excluded.name, uri = excluded.uri, redirect_uris = excluded.redirect_uris, fetched_at = now()
     RETURNING *`,
    [doc.client_id, doc.name, doc.uri, JSON.stringify(doc.redirect_uris)],
  ))!;
}

// ---- grants and tokens -------------------------------------------------------

export interface GrantRow {
  id: number;
  user_id: number;
  study_id: number;
  client_id: string;
  scope: string;
  resource: string;
  created: Date;
  last_used: Date | null;
  revoked_at: Date | null;
}

const scopesOf = (scope: string) => scope.split(" ").filter(Boolean) as McpScope[];

/**
 * SQL: whether a user may edit a study (WRITE or ADMIN). In development
 * mode also a study without user roles, as with development headers
 * (researcher/auth.ts: such a study is open).
 */
export const MAY_EDIT_SQL = (study: string, user: string, devMode: string) =>
  `(study_role(${study}, ${user}) IN ('WRITE', 'ADMIN') OR (${devMode} AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.study_id = ${study} AND r.user_id IS NOT NULL)))`;

/** Issues an access token and a refresh token for a grant. */
async function issueTokens(sql: Sql, grant: GrantRow) {
  const access = newToken("access");
  const refresh = newToken("refresh");
  await sql.query(
    `INSERT INTO oauth_tokens (hash, grant_id, kind, expires) VALUES
       ($1, $3, 'access', now() + make_interval(secs => $4)), ($2, $3, 'refresh', now() + make_interval(secs => $5))`,
    [hash(access), hash(refresh), grant.id, ACCESS_TTL_S, REFRESH_TTL_S],
  );
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grant.scope };
}

/** The grant an access token belongs to, if the token is valid and the grant not revoked. Records its use. */
export async function grantForAccessToken(sql: Sql, token: string): Promise<GrantRow | null> {
  if (!token.startsWith(PREFIX.access)) return null;
  return (
    (await one<GrantRow>(
      sql,
      `UPDATE oauth_grants g SET last_used = now() FROM oauth_tokens t
       WHERE t.hash = $1 AND t.kind = 'access' AND t.expires > now() AND t.grant_id = g.id AND g.revoked_at IS NULL
       RETURNING g.*`,
      [hash(token)],
    )) ?? null
  );
}

const revokeGrant = (sql: Sql, grantId: number) =>
  sql.query("UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1", [grantId]);

/** An OAuth error response (RFC 6749 §5.2). */
const oauthError = (c: Context, error: string, description: string, status: 400 | 401 = 400) => {
  c.header("cache-control", "no-store");
  return c.json({ error, error_description: description }, status);
};

/** A request body as fields: form-encoded (the standard), or JSON. */
async function formFields(c: Context): Promise<Record<string, string>> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  }
  const body = await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(Object.entries(body).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

/** `redirect_uri` with these query parameters added. */
function withParams(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.href;
}

/** The S256 PKCE challenge of a verifier. */
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

// ---- routes ------------------------------------------------------------------

/** Discovery documents, at the origin's root (outside /api). */
export function oauthDiscovery(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  const resourceMetadata = (c: Context) => {
    const base = baseUrl(server, c);
    return c.json({
      resource: mcpResource(base),
      authorization_servers: [base],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "AnnoTinder",
      resource_documentation: `${base}/research`,
    });
  };
  app.get("/.well-known/oauth-protected-resource/api/mcp", resourceMetadata);
  app.get("/.well-known/oauth-protected-resource", resourceMetadata);
  const serverMetadata = (c: Context) => {
    const base = baseUrl(server, c);
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...MCP_SCOPES],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  };
  app.get("/.well-known/oauth-authorization-server", serverMetadata);
  // Some clients look for the OpenID name of the same document
  app.get("/.well-known/openid-configuration", serverMetadata);
  return app;
}

/** The OAuth endpoints and the consent page's API (under /api). */
export function oauth(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  // Dynamic client registration (RFC 7591): public clients only.
  app.post("/oauth/register", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return oauthError(c, "invalid_client_metadata", "Expected a JSON body");
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (redirectUris.length === 0 || redirectUris.length > 20 || !redirectUris.every(validRedirectUri))
      return oauthError(c, "invalid_redirect_uri", "redirect_uris: https, http on localhost, or an app's own scheme; no fragments");
    if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none")
      return oauthError(c, "invalid_client_metadata", "Only public clients (token_endpoint_auth_method none), with PKCE");
    const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 200) : "An AI assistant";
    const uri = typeof body.client_uri === "string" && body.client_uri.startsWith("https://") ? body.client_uri.slice(0, 500) : null;
    const clientId = `amcp_client_${randomBytes(16).toString("base64url")}`;
    await db.query("INSERT INTO oauth_clients (client_id, kind, name, uri, redirect_uris) VALUES ($1, 'registered', $2, $3, $4)", [
      clientId,
      name,
      uri,
      JSON.stringify(redirectUris),
    ]);
    c.header("cache-control", "no-store");
    return c.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: name,
        ...(uri ? { client_uri: uri } : {}),
        redirect_uris: redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  });

  // The authorization request: checked, kept, and the browser goes to the consent page.
  app.get("/oauth/authorize", async (c) => {
    const q = c.req.query();
    const client = q.client_id ? await findClient(server, q.client_id) : null;
    // Without a known client and an exact redirect URI, nothing may be sent back (no open redirects)
    if (!client) return c.text("Unknown client: its client_id is not registered here, and no metadata document could be read from it.", 400);
    if (!q.redirect_uri || !redirectMatches(client.redirect_uris, q.redirect_uri))
      return c.text("This redirect_uri is not registered for the client.", 400);
    const base = baseUrl(server, c);
    const back = (error: string, description: string) =>
      c.redirect(withParams(q.redirect_uri, { error, error_description: description, state: q.state, iss: base }));
    if (q.response_type !== "code") return back("unsupported_response_type", "Only response_type=code");
    if (!q.code_challenge || q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge))
      return back("invalid_request", "PKCE is required: code_challenge with code_challenge_method=S256");
    if (q.resource && q.resource !== mcpResource(base)) return back("invalid_target", `The only resource here is ${mcpResource(base)}`);
    const requested = scopesOf(q.scope ?? MCP_SCOPES.join(" "));
    if (requested.some((s) => !MCP_SCOPES.includes(s))) return back("invalid_scope", `Scopes: ${MCP_SCOPES.join(", ")}`);
    // Reading comes with editing
    const scopes = MCP_SCOPES.filter((s) => requested.includes(s) || (s === "design:read" && requested.length > 0));
    const id = randomBytes(24).toString("base64url");
    await db.query(
      `INSERT INTO oauth_requests (id, client_id, redirect_uri, code_challenge, scope, state, resource, expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))`,
      [id, client.client_id, q.redirect_uri, q.code_challenge, scopes.join(" "), q.state ?? null, mcpResource(base), REQUEST_TTL_S],
    );
    await db.query("DELETE FROM oauth_requests WHERE expires < now()");
    return c.redirect(`/research/connect?request=${encodeURIComponent(id)}`);
  });

  interface RequestRow {
    id: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    scope: string;
    state: string | null;
    resource: string;
    expires: Date;
    name: string;
    uri: string | null;
  }
  const findRequest = (id: string) =>
    one<RequestRow>(
      db,
      `SELECT r.*, c.name, c.uri FROM oauth_requests r JOIN oauth_clients c USING (client_id) WHERE r.id = $1 AND r.expires > now()`,
      [id],
    );
  /** The studies a user may connect: those they may edit. */
  const editableStudies = (userId: number) =>
    db.query<{ id: number; name: string }>(
      `SELECT id, name FROM studies WHERE ${MAY_EDIT_SQL("studies.id", "$1", "$2")} ORDER BY lower(name), id`,
      [userId, server.devMode],
    );

  // The consent page: what is asked, and for which studies
  app.get("/oauth/requests/:id", requireResearcher(server), async (c) => {
    const request = await findRequest(c.req.param("id") ?? "");
    if (!request) return c.json({ error: "This request has expired: start connecting again from the assistant", code: "request_expired" }, 404);
    const info: OAuthRequestInfo = {
      client: { clientId: request.client_id, name: request.name, uri: request.uri, redirectHost: new URL(request.redirect_uri).host || request.redirect_uri },
      scopes: scopesOf(request.scope),
      studies: await editableStudies(c.get("researcher").userId),
      expires: request.expires,
    };
    return c.json(info);
  });

  app.post("/oauth/requests/:id/approve", requireResearcher(server), async (c) => {
    const researcher = c.get("researcher");
    // Allowing access is sensitive: never with an API key, and with a recent second factor
    checkSensitive(server, researcher);
    const parsed = OAuthApproveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const request = await findRequest(c.req.param("id") ?? "");
    if (!request) return c.json({ error: "This request has expired: start connecting again from the assistant", code: "request_expired" }, 404);
    const allowed = (await editableStudies(researcher.userId)).some((s) => s.id === parsed.data.studyId);
    if (!allowed) return c.json({ error: "You can only connect a study you may edit" }, 403);
    const code = newToken("code");
    await db.transaction(async (tx) => {
      // Used once: the request goes
      const taken = await one(tx, "DELETE FROM oauth_requests WHERE id = $1 RETURNING id", [request.id]);
      if (!taken) throw new Error("request already used");
      const grant = await one<GrantRow>(
        tx,
        "INSERT INTO oauth_grants (user_id, study_id, client_id, scope, resource) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [researcher.userId, parsed.data.studyId, request.client_id, request.scope, request.resource],
      );
      await tx.query(
        `INSERT INTO oauth_tokens (hash, grant_id, kind, expires, redirect_uri, code_challenge)
         VALUES ($1, $2, 'code', now() + make_interval(secs => $3), $4, $5)`,
        [hash(code), grant!.id, CODE_TTL_S, request.redirect_uri, request.code_challenge],
      );
    });
    await securityLog(db, researcher.userId, "assistant_connected", { client: request.client_id, name: request.name, study: parsed.data.studyId, scope: request.scope });
    return c.json({ redirectTo: withParams(request.redirect_uri, { code, state: request.state, iss: baseUrl(server, c) }) });
  });

  app.post("/oauth/requests/:id/deny", requireResearcher(server), async (c) => {
    const request = await findRequest(c.req.param("id") ?? "");
    if (!request) return c.json({ error: "This request has expired", code: "request_expired" }, 404);
    await db.query("DELETE FROM oauth_requests WHERE id = $1", [request.id]);
    return c.json({
      redirectTo: withParams(request.redirect_uri, { error: "access_denied", error_description: "The researcher did not allow access", state: request.state, iss: baseUrl(server, c) }),
    });
  });

  app.post("/oauth/token", async (c) => {
    const f = await formFields(c);
    const base = baseUrl(server, c);
    if (f.resource && f.resource !== mcpResource(base)) return oauthError(c, "invalid_target", `The only resource here is ${mcpResource(base)}`);

    if (f.grant_type === "authorization_code") {
      if (!f.code || !f.code_verifier || !f.client_id) return oauthError(c, "invalid_request", "code, code_verifier and client_id are required");
      const row = await one<GrantRow & { token_redirect: string; token_challenge: string; fresh: boolean }>(
        db,
        `SELECT g.*, t.redirect_uri AS token_redirect, t.code_challenge AS token_challenge, t.expires > now() AS fresh
         FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.hash = $1 AND t.kind = 'code'`,
        [hash(f.code)],
      );
      if (!row) return oauthError(c, "invalid_grant", "Unknown code");
      // Used once: a code coming back means someone else may have it, and the connection goes
      const claimed = await one(db, "UPDATE oauth_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL RETURNING hash", [hash(f.code)]);
      if (!claimed) {
        await revokeGrant(db, row.id);
        return oauthError(c, "invalid_grant", "This code was already used");
      }
      if (!row.fresh || row.revoked_at) return oauthError(c, "invalid_grant", "This code has expired");
      if (row.client_id !== f.client_id) return oauthError(c, "invalid_grant", "This code is for another client");
      if (f.redirect_uri !== undefined && f.redirect_uri !== row.token_redirect) return oauthError(c, "invalid_grant", "redirect_uri does not match");
      if (challengeOf(f.code_verifier) !== row.token_challenge) return oauthError(c, "invalid_grant", "code_verifier does not match");
      c.header("cache-control", "no-store");
      return c.json(await issueTokens(db, row));
    }

    if (f.grant_type === "refresh_token") {
      if (!f.refresh_token || !f.client_id) return oauthError(c, "invalid_request", "refresh_token and client_id are required");
      const row = await one<GrantRow & { token_used: Date | null; fresh: boolean }>(
        db,
        `SELECT g.*, t.used_at AS token_used, t.expires > now() AS fresh FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
         WHERE t.hash = $1 AND t.kind = 'refresh'`,
        [hash(f.refresh_token)],
      );
      if (!row || row.revoked_at) return oauthError(c, "invalid_grant", "Unknown or revoked refresh token");
      if (row.client_id !== f.client_id) return oauthError(c, "invalid_grant", "This token is for another client");
      // Rotation: each refresh token works once; one coming back means it leaked
      const used = await one(db, "UPDATE oauth_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL RETURNING hash", [hash(f.refresh_token)]);
      if (!used || row.token_used) {
        await revokeGrant(db, row.id);
        return oauthError(c, "invalid_grant", "This refresh token was already used: the connection is revoked");
      }
      if (!row.fresh) return oauthError(c, "invalid_grant", "This refresh token has expired");
      c.header("cache-control", "no-store");
      return c.json(await issueTokens(db, row));
    }

    return oauthError(c, "unsupported_grant_type", "authorization_code or refresh_token");
  });

  // Revocation (RFC 7009): any of a connection's tokens ends the whole connection.
  app.post("/oauth/revoke", async (c) => {
    const f = await formFields(c);
    if (f.token) {
      const row = await one<{ grant_id: number }>(db, "SELECT grant_id FROM oauth_tokens WHERE hash = $1", [hash(f.token)]);
      if (row) await revokeGrant(db, row.grant_id);
    }
    return c.body(null, 200);
  });

  // The researcher's connected assistants (account menu)
  app.get("/me/connections", requireResearcher(server), async (c) => {
    const rows = await db.query<GrantRow & { client_name: string; client_uri: string | null; study_name: string }>(
      `SELECT g.*, c.name AS client_name, c.uri AS client_uri, s.name AS study_name
       FROM oauth_grants g JOIN oauth_clients c USING (client_id) JOIN studies s ON s.id = g.study_id
       WHERE g.user_id = $1 AND g.revoked_at IS NULL
         AND EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.grant_id = g.id AND t.kind = 'refresh' AND t.used_at IS NULL AND t.expires > now())
       ORDER BY g.created DESC`,
      [c.get("researcher").userId],
    );
    const list: Connection[] = rows.map((r) => ({
      id: r.id,
      client: { clientId: r.client_id, name: r.client_name, uri: r.client_uri },
      study: { id: r.study_id, name: r.study_name },
      scopes: scopesOf(r.scope),
      created: r.created,
      lastUsed: r.last_used,
    }));
    return c.json(list);
  });

  app.post("/me/connections/:id/revoke", requireResearcher(server), async (c) => {
    const researcher = c.get("researcher");
    const id = Number(c.req.param("id"));
    const row = await one<{ id: number; client_id: string }>(
      db,
      "UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id, client_id",
      [Number.isInteger(id) ? id : 0, researcher.userId],
    );
    if (!row) return c.json({ error: "Connection not found" }, 404);
    await securityLog(db, researcher.userId, "assistant_disconnected", { client: row.client_id });
    return c.body(null, 204);
  });

  return app;
}

export const oauthScopes = scopesOf;
