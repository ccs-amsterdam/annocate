import { Hono, type Context } from "hono";
import {
  CONTRACTS_VERSION,
  PostCoderVariablesSchema,
  PostUnitVariablesSchema,
  RedeemTransferSchema,
  RefreshDeploymentSchema,
  type RefreshDeployment,
} from "@annotinder/contracts";
import { HttpError, type BackendConfig } from "./backend.js";
import { DeploymentRegistry } from "./registry.js";
import type { OutboxStore } from "./outbox.js";
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
  /** Db servers this job server accepts deployments from, by name. */
  backends: Record<string, BackendConfig>;
  fetch?: typeof fetch;
  runtime?: Partial<RuntimeOptions>;
  /** Where pending writes to db servers are kept; memory if not given (fine for tests, not for production). */
  outbox?: OutboxStore;
}

interface Env {
  Variables: { runtime: DeploymentRuntime; coder: Coder; sessionKey: string };
}

/**
 * The job server's HTTP surface. Runtime-agnostic (plain Hono + fetch), so
 * the same app can run on Node (index.ts) or a Cloudflare Worker.
 *
 * - `/d/:deploymentId/...`: the coder-facing API (same paths as contracts
 *   `endpoints.getSession` etc.), so the client's `HttpJobServer` just uses
 *   `<job server>/d/<deploymentId>` as its base URL.
 * - `/admin/deployments/:deploymentId/...`: called by the db server.
 */
export function createJobServer(options: JobServerOptions) {
  const registry = new DeploymentRegistry(
    options.backends,
    // Wrapped: Workers refuse `fetch` called as a method of another object.
    options.fetch ?? ((input, init) => fetch(input, init)),
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

  // --- coder API ----------------------------------------------------------

  // No CORS: the client is served from the job server's origin, so the
  // browser refuses cross-origin calls that carry the required header.

  // Redeeming a transfer link: this device gets the session's cookie.
  app.post("/d/:deploymentId/transfer/redeem", async (c) => {
    requireClientHeader(c);
    const body = await parseBody(c, RedeemTransferSchema);
    const deploymentId = c.req.param("deploymentId");
    const runtime = await registry.get(deploymentId);
    const sessionKey = runtime.redeemTransfer(body.token);
    const name = await sessionCookieName(c.req.header("x-invite-secret"), c.req.header("x-participant-id"));
    writeSession(c, deploymentId, name, sessionKey);
    return c.json({});
  });

  const coders = new Hono<Env>();
  coders.use("*", async (c, next) => {
    requireClientHeader(c);
    const deploymentId = c.req.param("deploymentId")!;
    const runtime = await registry.get(deploymentId);
    await runtime.refresh();
    c.set("runtime", runtime);

    // The session cookie, or a new session: no cookie yet, or the coder asked
    // for a new one (a participant id that already has a session elsewhere).
    const inviteSecret = c.req.header("x-invite-secret");
    const participantId = c.req.header("x-participant-id");
    const newSession = c.req.header("x-new-session") === "1";
    const name = await sessionCookieName(inviteSecret, participantId);
    const existing = newSession ? undefined : readSession(c, name);
    const sessionKey = existing ?? newSessionKey();
    const coder = await runtime.resolveCoder({
      coderKey: await backendCoderKey(sessionKey),
      inviteSecret,
      participantId,
      newSession,
    });
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

  app.route("/d/:deploymentId", coders);

  // --- admin API (db server -> job server) ----------------------------------

  const admin = new Hono<Env>();
  admin.use("*", async (c, next) => {
    const backend = registry.backendFor(c.req.param("deploymentId")!);
    if (c.req.header("authorization") !== `Bearer ${backend.secret}`) throw new HttpError(401, "Unauthorized");
    await next();
  });

  admin.post("/refresh", async (c) => {
    const runtime = await registry.get(c.req.param("deploymentId")!);
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
    const runtime = await registry.get(c.req.param("deploymentId")!);
    await runtime.refresh();
    return c.json(await runtime.status());
  });

  admin.delete("/", (c) => {
    registry.drop(c.req.param("deploymentId")!);
    return c.body(null, 204);
  });

  app.route("/admin/deployments/:deploymentId", admin);

  // Hosts call this to send what a previous run left behind (index.ts, worker.ts).
  return Object.assign(app, { flushPending: () => registry.flushPending() });
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
