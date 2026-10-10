import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { CONTRACTS_VERSION, PostCoderVariablesSchema, PostUnitVariablesSchema } from "@annotinder/contracts";
import { HttpError, type BackendConfig } from "./backend.js";
import { DeploymentRegistry } from "./registry.js";
import { DEFAULT_RUNTIME_OPTIONS, type Coder, type DeploymentRuntime, type RuntimeOptions } from "./runtime.js";

export interface JobServerOptions {
  /** Db servers this job server accepts deployments from, by name. */
  backends: Record<string, BackendConfig>;
  fetch?: typeof fetch;
  runtime?: Partial<RuntimeOptions>;
}

interface Env {
  Variables: { runtime: DeploymentRuntime; coder: Coder };
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
  const registry = new DeploymentRegistry(options.backends, options.fetch ?? fetch, {
    ...DEFAULT_RUNTIME_OPTIONS,
    ...options.runtime,
  });
  const app = new Hono<Env>();

  app.use("*", cors());
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });

  app.get("/", (c) => c.json({ ok: true, service: "annotinder-job-server", contractsVersion: CONTRACTS_VERSION }));

  // --- coder API ----------------------------------------------------------

  const coders = new Hono<Env>();
  coders.use("*", async (c, next) => {
    const coderKey = c.req.header("x-coder-key");
    if (!coderKey) throw new HttpError(401, "Missing x-coder-key header");
    const runtime = await registry.get(c.req.param("deploymentId")!);
    await runtime.refresh();
    c.set("runtime", runtime);
    c.set("coder", await runtime.resolveCoder(coderKey, c.req.header("x-invite-secret")));
    await next();
  });

  coders.get("/session", (c) => c.json(c.get("runtime").session(c.get("coder"))));

  coders.get("/loop/:loop/next", async (c) =>
    c.json(await c.get("runtime").nextUnit(c.get("coder"), c.req.param("loop"))),
  );

  coders.post("/variables/unit", async (c) => {
    const body = await parseBody(c, PostUnitVariablesSchema);
    await c.get("runtime").submitUnit(c.get("coder"), body.unitId, body.variables);
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
    await runtime.refresh(true);
    return c.json(runtime.status());
  });

  admin.get("/status", async (c) => {
    const runtime = await registry.get(c.req.param("deploymentId")!);
    await runtime.refresh();
    return c.json(runtime.status());
  });

  admin.delete("/", (c) => {
    registry.drop(c.req.param("deploymentId")!);
    return c.body(null, 204);
  });

  app.route("/admin/deployments/:deploymentId", admin);

  return app;
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
