import { Hono, type Context } from "hono";
import {
  CONTRACTS_VERSION,
  PostCoderVariablesSchema,
  PostUnitVariablesSchema,
  RedeemTransferSchema,
  RefreshDeploymentSchema,
  type RefreshDeployment,
  JOB_SERVER_SIGNATURE_HEADER,
} from "@annotinder/contracts";
import { HttpError } from "./backend.js";
import { DbServers, DEFAULT_DB_SERVER_OPTIONS, type DbServerOptions, type DbServerPolicy } from "./dbServers.js";
import { DeploymentRegistry } from "./registry.js";
import { verifyCallSignature } from "./jobTokens.js";
import type { OutboxStore } from "./outbox.js";
import { SigningKeys } from "./keys.js";
import {
  backendCoderKey,
  newSessionKey,
  readSession,
  requireClientHeader,
  sessionCookieName,
  writeSession,
} from "./session.js";
import { DEFAULT_RUNTIME_OPTIONS, type Coder, type DeploymentRuntime, type RuntimeOptions } from "./runtime.js";

export interface JobServerOptions {
  /** The db servers this job server works for: a list of URLs, or `"open"` for any https db server (dbServers.ts). */
  dbServers: DbServerPolicy;
  /** Outbound limits, and (open mode, Node) a check that hosts aren't private. */
  dbServerOptions?: Partial<DbServerOptions>;
  /** This job server's own URL, as db servers bind jobs to it (plan §13). */
  publicUrl: string;
  fetch?: typeof fetch;
  runtime?: Partial<RuntimeOptions>;
  /** Where pending writes to db servers are kept; memory if not given (fine for tests, not for production). */
  outbox?: OutboxStore;
  /** This job server's identity towards db servers (keys.ts). A key for this process only if not given (dev, tests). */
  signingKeys?: SigningKeys | Promise<SigningKeys>;
}

interface Env {
  Variables: { runtime: DeploymentRuntime; coder: Coder; sessionKey: string };
}

/**
 * The job server's HTTP surface. Runtime-agnostic (plain Hono + fetch), so
 * the same app can run on Node (index.ts) or a Cloudflare Worker.
 *
 * - `/d/<db host>/<jobId>/...`: the coder-facing API (same paths as contracts
 *   `endpoints.getSession` etc.), so the client's `HttpJobServer` just uses
 *   `<job server>/d/<deploymentId>` as its base URL.
 * - `/admin/deployments/<db host>/<jobId>/...`: called by the db server.
 */
export function createJobServer(options: JobServerOptions) {
  const signingKeys = Promise.resolve(options.signingKeys ?? SigningKeys.ephemeral());
  const dbServers = new DbServers(
    options.dbServers,
    // Wrapped: Workers refuse `fetch` called as a method of another object.
    options.fetch ?? ((input, init) => fetch(input, init)),
    { ...DEFAULT_DB_SERVER_OPTIONS, ...options.dbServerOptions },
  );
  const registry = new DeploymentRegistry(
    dbServers,
    { publicUrl: options.publicUrl.replace(/\/$/, ""), keys: signingKeys },
    { ...DEFAULT_RUNTIME_OPTIONS, ...options.runtime },
    options.outbox,
  );
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });

  app.get("/", (c) => c.json({ ok: true, service: "annotinder-job-server", contractsVersion: CONTRACTS_VERSION }));

  // Public keys: db servers verify this job server's token requests with them.
  app.get("/.well-known/jwks.json", async (c) => c.json((await signingKeys).jwks()));

  // --- coder API ----------------------------------------------------------

  // No CORS: the client is served from the job server's origin, so the
  // browser refuses cross-origin calls that carry the required header.

  // Redeeming a transfer link: this device gets the session's cookie.
  app.post("/d/:host/:job/transfer/redeem", async (c) => {
    requireClientHeader(c);
    const body = await parseBody(c, RedeemTransferSchema);
    const deploymentId = deploymentIdOf(c);
    const runtime = await registry.get(deploymentId);
    const sessionKey = runtime.redeemTransfer(body.token);
    const name = await sessionCookieName(c.req.header("x-participant-id"));
    writeSession(c, deploymentId, name, sessionKey);
    return c.json({});
  });

  const coders = new Hono<Env>();
  coders.use("*", async (c, next) => {
    requireClientHeader(c);
    const deploymentId = deploymentIdOf(c);
    const runtime = await registry.get(deploymentId);
    await runtime.refresh();
    c.set("runtime", runtime);

    // The session cookie, or a new session: no cookie yet, or the coder asked
    // for a new one (a participant id that already has a session elsewhere).
    const inviteSecret = c.req.header("x-invite-secret");
    const participantId = c.req.header("x-participant-id");
    const newSession = c.req.header("x-new-session") === "1";
    const name = await sessionCookieName(participantId);
    const existing = newSession ? undefined : readSession(c, name);
    const sessionKey = existing ?? newSessionKey();
    const coder = await runtime.resolveCoder(
      { coderKey: await backendCoderKey(sessionKey), inviteSecret, participantId, newSession },
      // The page's query parameters, for `url_param` auto variables.
      Object.fromEntries(new URLSearchParams(c.req.header("x-url-params") ?? "")),
    );
    // Only once the db server accepted it (an invite may be invalid or used up).
    if (sessionKey !== existing) writeSession(c, deploymentId, name, sessionKey);
    c.set("sessionKey", sessionKey);
    c.set("coder", coder);
    await next();
  });

  coders.post("/transfer", (c) => c.json(c.get("runtime").createTransfer(c.get("sessionKey"))));

  coders.get("/session", (c) => c.json(c.get("runtime").session(c.get("coder"))));

  coders.get("/loop/:loop/next", async (c) =>
    c.json(await c.get("runtime").nextUnit(c.get("coder"), c.req.param("loop"))),
  );

  coders.get("/loop/:loop/units/:unitId", async (c) =>
    c.json(await c.get("runtime").loopUnit(c.get("coder"), c.req.param("loop"), Number(c.req.param("unitId")))),
  );

  coders.post("/variables/unit", async (c) => {
    const body = await parseBody(c, PostUnitVariablesSchema);
    await c.get("runtime").submitUnit(c.get("coder"), body.unitId, body.variables, body.loop);
    return c.body(null, 204);
  });

  coders.post("/variables/coder", async (c) => {
    const body = await parseBody(c, PostCoderVariablesSchema);
    await c.get("runtime").submitCoderVariables(c.get("coder"), body.variables);
    return c.body(null, 204);
  });

  app.route("/d/:host/:job", coders);

  // --- admin API (db server -> job server) ----------------------------------

  const admin = new Hono<Env>();
  // Signed by the db server with the job's call key (contracts
  // JOB_SERVER_SIGNATURE_HEADER), which we know from our own job token.
  admin.use("*", async (c, next) => {
    const deploymentId = deploymentIdOf(c);
    registry.backendFor(deploymentId); // 404 for unknown db servers, before any token request
    const callKey = await registry.tokensFor(deploymentId).callKey();
    const call = { method: c.req.method, path: new URL(c.req.url).pathname, body: await c.req.text() };
    if (!(await verifyCallSignature(c.req.header(JOB_SERVER_SIGNATURE_HEADER), callKey, call, Date.now()))) {
      throw new HttpError(401, "Invalid signature");
    }
    await next();
  });

  admin.post("/refresh", async (c) => {
    const runtime = await registry.get(deploymentIdOf(c));
    // The body is optional (a plain notification has none).
    const text = await c.req.text();
    let body: RefreshDeployment = {};
    if (text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new HttpError(400, "Invalid JSON body");
      }
      const parsed = RefreshDeploymentSchema.safeParse(raw);
      if (!parsed.success) throw new HttpError(400, "Invalid request body");
      body = parsed.data;
    }
    if (body.units) runtime.clearUnits(body.units);
    await runtime.refresh(true);
    // Not the status: that is computed from the db server, too heavy for a notification.
    return c.json({ version: runtime.version });
  });

  admin.get("/status", async (c) => {
    const runtime = await registry.get(deploymentIdOf(c));
    await runtime.refresh();
    return c.json(await runtime.status());
  });

  admin.delete("/", (c) => {
    registry.drop(deploymentIdOf(c));
    return c.body(null, 204);
  });

  app.route("/admin/deployments/:host/:job", admin);

  // Hosts call this to send what a previous run left behind (index.ts, worker.ts).
  return Object.assign(app, { flushPending: () => registry.flushPending() });
}

/** `<db host>/<jobId>` (or `.../<jobId>.preview`) from the route (dbServers.ts). */
function deploymentIdOf(c: Context): string {
  return `${c.req.param("host")!.toLowerCase()}/${c.req.param("job")}`;
}

async function parseBody<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid request body");
  return parsed.data;
}
