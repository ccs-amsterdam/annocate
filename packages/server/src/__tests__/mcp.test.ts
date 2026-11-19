import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { createSession } from "../shared/sessions.js";
import { createApiKey, ensureUser, setServerRole } from "../shared/accounts.js";
import { emptyDb } from "./testDb.js";

// AI assistants (docs/api/mcp.md): an MCP client registers, the researcher
// allows it for one study on the consent page, the client gets tokens and
// reads and edits that study's design through /api/mcp, as drafts only.

const BASE = "http://localhost";
const REDIRECT = "https://assistant.example/callback";
let db: Sql;
let app: ReturnType<typeof createApp>;
/** Client metadata documents the (fake) internet serves. */
let documents: Map<string, unknown>;

beforeEach(async () => {
  db = await emptyDb();
  documents = new Map();
  app = createApp(db, {
    fetchClientMetadata: async (url) =>
      documents.has(url) ? new Response(JSON.stringify(documents.get(url)), { status: 200 }) : new Response("not found", { status: 404 }),
  });
});

/** A researcher's web session (recent second factor unless `stale`), as request headers. */
async function researcher(email: string, { stale = false } = {}): Promise<Record<string, string>> {
  const user = await ensureUser(db, email);
  await setServerRole(db, user.id, "researcher");
  const authTime = stale ? new Date(Date.now() - 60 * 60 * 1000) : new Date();
  const key = await createSession(db, user.id, { mfa: true, authTime, issuer: "https://idp.test" });
  return { cookie: `annotinder_session=${key}`, "x-annotinder": "1", "content-type": "application/json" };
}

async function createStudy(headers: Record<string, string>, name = "Pilot"): Promise<number> {
  const res = await app.request("/api/study", { method: "POST", headers, body: JSON.stringify({ name }) });
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

async function register(redirectUris = [REDIRECT]): Promise<string> {
  const res = await app.request("/api/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test assistant", redirect_uris: redirectUris }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

/** Starts authorizing: the request id the consent page gets (or the response, if it isn't a redirect to it). */
async function authorize(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "design:read design:edit",
    resource: `${BASE}/api/mcp`,
    ...extra,
  });
  const res = await app.request(`/api/oauth/authorize?${query}`);
  const location = res.headers.get("location") ?? "";
  const match = /^\/research\/connect\?request=(.+)$/.exec(location);
  return { res, location, requestId: match ? decodeURIComponent(match[1]) : null };
}

async function approve(requestId: string, headers: Record<string, string>, studyId: number) {
  return app.request(`/api/oauth/requests/${requestId}/approve`, { method: "POST", headers, body: JSON.stringify({ studyId }) });
}

async function token(fields: Record<string, string>) {
  const res = await app.request("/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

/** The whole flow: a connected assistant for a new study, with its tokens. */
async function connected(headers?: Record<string, string>) {
  headers ??= await researcher("jane@uni.nl");
  const studyId = await createStudy(headers);
  const clientId = await register();
  const { verifier, challenge } = pkce();
  const { requestId } = await authorize(clientId, challenge);
  const approved = await approve(requestId!, headers, studyId);
  expect(approved.status, await approved.clone().text()).toBe(200);
  const code = new URL(((await approved.json()) as { redirectTo: string }).redirectTo).searchParams.get("code")!;
  const tokens = await token({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
  expect(tokens.status).toBe(200);
  return { headers, studyId, clientId, ...tokens.body };
}

let rpcId = 0;
async function rpc(accessToken: string, method: string, params: Record<string, unknown> = {}) {
  const res = await app.request("/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  return { status: res.status, headers: res.headers, body: (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } } };
}

const call = async (accessToken: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(accessToken, "tools/call", { name, arguments: args });
  return res.body.result as { structuredContent?: Record<string, unknown>; isError?: boolean; content: { text: string }[] };
};

const QUESTION = { type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "a" }, { value: "b" }] } };

describe("discovery", () => {
  it("names this server as the authorization server of the MCP endpoint, and its endpoints", async () => {
    const resource = (await (await app.request("/.well-known/oauth-protected-resource/api/mcp")).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({ resource: `${BASE}/api/mcp`, authorization_servers: [BASE], scopes_supported: ["design:read", "design:edit"] });
    const server = (await (await app.request("/.well-known/oauth-authorization-server")).json()) as Record<string, unknown>;
    expect(server).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/api/oauth/authorize`,
      token_endpoint: `${BASE}/api/oauth/token`,
      registration_endpoint: `${BASE}/api/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    });
  });

  it("answers an MCP request without a token with where to log in", async () => {
    const res = await app.request("/api/mcp", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`);
  });

  it("serves the design's JSON Schema publicly", async () => {
    const res = await app.request("/api/schema/design.json");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { properties: Record<string, unknown> }).properties).toHaveProperty("items");
  });
});

describe("authorizing", () => {
  it("refuses unknown clients and unregistered redirect URIs without redirecting", async () => {
    const { challenge } = pkce();
    expect((await authorize("nobody", challenge)).res.status).toBe(400);
    const clientId = await register();
    const wrong = await authorize(clientId, challenge, { redirect_uri: "https://evil.example/cb" });
    expect(wrong.res.status).toBe(400);
    expect(wrong.location).toBe("");
  });

  it("requires PKCE (S256), sent back to the client as an error", async () => {
    const clientId = await register();
    const { location } = await authorize(clientId, "x", { code_challenge_method: "plain" });
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("error")).toBe("invalid_request");
    expect(url.searchParams.get("state")).toBe("xyz");
  });

  it("reads a client metadata document as the client", async () => {
    const clientId = "https://assistant.example/client.json";
    documents.set(clientId, { client_id: clientId, client_name: "Doc assistant", redirect_uris: [REDIRECT] });
    const headers = await researcher("jane@uni.nl");
    const { challenge } = pkce();
    const { requestId } = await authorize(clientId, challenge);
    expect(requestId).toBeTruthy();
    const info = (await (await app.request(`/api/oauth/requests/${requestId}`, { headers })).json()) as { client: { name: string } };
    expect(info.client.name).toBe("Doc assistant");
    // A document that isn't about itself is not trusted
    const other = "https://assistant.example/other.json";
    documents.set(other, { client_id: clientId, redirect_uris: [REDIRECT] });
    expect((await authorize(other, challenge)).res.status).toBe(400);
  });

  it("lets the researcher choose among studies they may edit, with a recent second factor, never with an API key", async () => {
    const jane = await researcher("jane@uni.nl");
    const studyId = await createStudy(jane);
    const clientId = await register();
    const { challenge } = pkce();
    const { requestId } = await authorize(clientId, challenge);
    const info = (await (await app.request(`/api/oauth/requests/${requestId}`, { headers: jane })).json()) as { studies: { id: number }[] };
    expect(info.studies.map((s) => s.id)).toEqual([studyId]);

    // Someone without a role in the study can't connect it
    const bob = await researcher("bob@uni.nl");
    expect((await approve(requestId!, bob, studyId)).status).toBe(403);
    // A login without a recent second factor: step up first
    const stale = await researcher("jane@uni.nl", { stale: true });
    const res = await approve(requestId!, stale, studyId);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("step_up_required");
    // An API key can never allow access
    const user = await ensureUser(db, "jane@uni.nl");
    const key = (await createApiKey(db, user.id, "script", true)).key;
    const withKey = await approve(requestId!, { authorization: `Bearer ${key}`, "content-type": "application/json" }, studyId);
    expect(((await withKey.json()) as { code: string }).code).toBe("not_with_api_key");
  });

  it("sends a denial back to the client", async () => {
    const jane = await researcher("jane@uni.nl");
    const clientId = await register();
    const { challenge } = pkce();
    const { requestId } = await authorize(clientId, challenge);
    const res = await app.request(`/api/oauth/requests/${requestId}/deny`, { method: "POST", headers: jane });
    const url = new URL(((await res.json()) as { redirectTo: string }).redirectTo);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("xyz");
  });
});

describe("tokens", () => {
  it("checks the PKCE verifier, and a code works once (used again, the connection goes)", async () => {
    const jane = await researcher("jane@uni.nl");
    const studyId = await createStudy(jane);
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const { requestId } = await authorize(clientId, challenge);
    const redirectTo = ((await (await approve(requestId!, jane, studyId)).json()) as { redirectTo: string }).redirectTo;
    const code = new URL(redirectTo).searchParams.get("code")!;
    expect(new URL(redirectTo).searchParams.get("iss")).toBe(BASE);

    const wrong = await token({ grant_type: "authorization_code", code, code_verifier: "x".repeat(43), client_id: clientId });
    expect(wrong.body.error).toBe("invalid_grant");
    // The code was spent on the failed attempt: it doesn't work again, and the connection is revoked
    const again = await token({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId });
    expect(again.body.error).toBe("invalid_grant");
  });

  it("rotates refresh tokens; one used twice revokes the connection", async () => {
    const c = await connected();
    const next = await token({ grant_type: "refresh_token", refresh_token: c.refresh_token, client_id: c.clientId });
    expect(next.status).toBe(200);
    expect(next.body.refresh_token).not.toBe(c.refresh_token);
    expect((await rpc(next.body.access_token, "ping")).status).toBe(200);
    // The old refresh token again: stolen, so everything stops
    expect((await token({ grant_type: "refresh_token", refresh_token: c.refresh_token, client_id: c.clientId })).body.error).toBe("invalid_grant");
    expect((await rpc(next.body.access_token, "ping")).status).toBe(401);
  });

  it("works only for the MCP endpoint, never for the researcher API", async () => {
    const c = await connected();
    expect((await app.request("/api/study", { headers: { authorization: `Bearer ${c.access_token}` } })).status).toBe(401);
  });

  it("stops when the researcher disconnects the assistant, or can no longer edit the study", async () => {
    const c = await connected();
    const list = (await (await app.request("/api/me/connections", { headers: c.headers })).json()) as { id: number; study: { id: number } }[];
    expect(list).toEqual([expect.objectContaining({ study: expect.objectContaining({ id: c.studyId }) })]);

    // Only reading rights left: the assistant is refused
    await db.query("UPDATE roles SET role = 'READ' WHERE study_id = $1", [c.studyId]);
    expect((await rpc(c.access_token, "ping")).status).toBe(403);
    await db.query("UPDATE roles SET role = 'ADMIN' WHERE study_id = $1", [c.studyId]);
    expect((await rpc(c.access_token, "ping")).status).toBe(200);

    expect((await app.request(`/api/me/connections/${list[0].id}/revoke`, { method: "POST", headers: c.headers })).status).toBe(204);
    expect((await rpc(c.access_token, "ping")).status).toBe(401);
    expect(await (await app.request("/api/me/connections", { headers: c.headers })).json()).toEqual([]);
  });
});

describe("the MCP endpoint", () => {
  it("initializes, and lists its tools, resources and prompts", async () => {
    const c = await connected();
    const init = await rpc(c.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "annotinder" } });
    expect(String(init.body.result!.instructions)).toContain('"Pilot"');
    const tools = (await rpc(c.access_token, "tools/list")).body.result!.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_design", "validate_design", "save_design_draft", "get_units_summary", "list_design_versions", "diff_draft_vs_live"]),
    );
    const resources = (await rpc(c.access_token, "resources/list")).body.result!.resources as { uri: string }[];
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(["annotinder://schema/design", "annotinder://help/questions", "annotinder://glossary"]));
    const schema = (await rpc(c.access_token, "resources/read", { uri: "annotinder://schema/design" })).body.result!.contents as { text: string }[];
    expect(JSON.parse(schema[0].text)).toHaveProperty("properties.items");
    expect((await rpc(c.access_token, "prompts/get", { name: "edit_codebook", arguments: { goal: "add a tone question" } })).body.result).toHaveProperty("messages");
  });

  it("saves drafts (with the revision), validates, compares with the live version, and never deploys", async () => {
    const c = await connected();
    expect((await call(c.access_token, "get_design")).content[0].text).toContain("no design yet");

    // A new draft
    const first = await call(c.access_token, "save_design_draft", { design: { public: { title: "Tone study" }, items: [QUESTION] }, note: "First question" });
    expect(first.structuredContent).toMatchObject({ saved: true, version: 1, status: "draft", valid: true });
    const got = (await call(c.access_token, "get_design")).structuredContent!;
    expect(got).toMatchObject({ version: 1, status: "draft", revision: 1, design: { public: { title: "Tone study" }, items: [QUESTION] } });

    // Updating the draft needs its revision, so nobody's edits are overwritten
    const edited = { items: [QUESTION, { ...QUESTION, name: "tone" }] };
    expect((await call(c.access_token, "save_design_draft", { design: edited })).isError).toBe(true);
    expect((await call(c.access_token, "save_design_draft", { design: edited, revision: 5 })).isError).toBe(true);
    const second = await call(c.access_token, "save_design_draft", { design: edited, revision: 1 });
    expect(second.structuredContent).toMatchObject({ saved: true, version: 1, revision: 2 });
    // Saved by the researcher too, as the assistant
    const versions = (await (await app.request(`/api/study/${c.studyId}/design`, { headers: c.headers })).json()) as { updatedBy: string }[];
    expect(versions[0].updatedBy).toBe("jane@uni.nl (via Test assistant)");

    // Validation: problems per item
    const invalid = await call(c.access_token, "validate_design", { design: { items: [{ ...QUESTION, variable: { type: "nominal", question: "?", options: [] } }] } });
    expect(invalid.structuredContent).toMatchObject({ valid: false });
    expect((invalid.structuredContent!.issues as { path: string }[])[0].path).toMatch(/^items\[0\]/);
    expect((await call(c.access_token, "validate_design")).structuredContent).toMatchObject({ valid: true });

    // Nothing is deployed by the assistant
    expect(await db.query("SELECT 1 FROM deployments WHERE study_id = $1", [c.studyId])).toEqual([]);
    expect((await call(c.access_token, "diff_draft_vs_live")).structuredContent).toMatchObject({ live: null });

    // Deployed by the researcher: the next save starts a new draft, compared with the live one
    const deploy = await app.request(`/api/study/${c.studyId}/deployment`, {
      method: "PUT",
      headers: c.headers,
      body: JSON.stringify({ designVersionId: (versions[0] as unknown as { id: number }).id, units: true }),
    });
    expect(deploy.status, await deploy.clone().text()).toBe(200);
    const third = await call(c.access_token, "save_design_draft", { design: { items: [QUESTION] } });
    expect(third.structuredContent).toMatchObject({ saved: true, version: 2 });
    expect((await call(c.access_token, "diff_draft_vs_live")).structuredContent).toMatchObject({ draft: 2, live: 1, items: { removed: ["tone"], added: [], changed: [] } });
    const list = (await call(c.access_token, "list_design_versions")).structuredContent!.versions as { status: string }[];
    expect(list.map((v) => v.status)).toEqual(["live", "draft"]);
  });

  it("only does what the scopes allow", async () => {
    const jane = await researcher("jane@uni.nl");
    const studyId = await createStudy(jane);
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const { requestId } = await authorize(clientId, challenge, { scope: "design:read" });
    const code = new URL(((await (await approve(requestId!, jane, studyId)).json()) as { redirectTo: string }).redirectTo).searchParams.get("code")!;
    const { body } = await token({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId });
    const tools = (await rpc(body.access_token, "tools/list")).body.result!.tools as { name: string }[];
    expect(tools.map((t) => t.name)).not.toContain("save_design_draft");
    expect((await call(body.access_token, "save_design_draft", { design: { items: [QUESTION] } })).isError).toBe(true);
  });
});
