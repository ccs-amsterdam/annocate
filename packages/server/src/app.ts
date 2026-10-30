import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Sql } from "./db.js";
import { CONTRACTS_VERSION } from "@annotinder/contracts";
import type { Env, Server } from "./context.js";
import { coderApi } from "./coder.js";
import { Deployments } from "./runtime/registry.js";
import { DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime/runtime.js";
import type { Store } from "./runtime/store.js";
import { HttpError } from "./shared/http.js";
import { annotationsReset } from "./researcher/annotations.reset.js";
import { annotations } from "./researcher/annotations.js";
import { me } from "./researcher/me.js";
import { admin } from "./researcher/admin.js";
import { login } from "./researcher/login.js";
import { Oidc, type OidcOptions } from "./oidc.js";
import { codebook } from "./researcher/codebook.$id.js";
import { codebooks } from "./researcher/codebook.js";
import { coders } from "./researcher/coders.js";
import { deploymentPreview } from "./researcher/deployment.preview.js";
import { deploymentStatus } from "./researcher/deployment.status.js";
import { deployment } from "./researcher/deployment.js";
import { invites } from "./researcher/invites.js";
import { job } from "./researcher/job.$id.js";
import { jobUsers } from "./researcher/job.$id.users.js";
import { jobs } from "./researcher/job.js";
import { examples } from "./researcher/examples.js";
import { overview } from "./researcher/overview.js";
import { unit } from "./researcher/units.$id.js";
import { sets } from "./researcher/sets.js";
import { unitsFields } from "./researcher/units.fields.js";
import { unitsPage } from "./researcher/units.page.js";
import { units } from "./researcher/units.js";

export interface AppOptions {
  /** Signs preview tokens. Random per process if not given (previews then end with a restart). */
  secret?: string;
  runtime?: Partial<RuntimeOptions>;
  /** Tests: observe or alter what the runtime reads and writes. */
  wrapStore?: (store: Store) => Store;
  /**
   * Accept development auth headers (`x-dev-role`) for the researcher API
   * (researcher/auth.ts). For local development and tests only.
   */
  devAuth?: boolean;
  /**
   * Researcher login with an OpenID Connect provider (oidc.ts). `publicUrl`
   * is where browsers reach this server (and the client), e.g.
   * `https://annotinder.com`; the provider redirects to `<publicUrl>/auth/callback`.
   */
  login?: { oidc: OidcOptions; publicUrl: string };
  /** Emails that are admins (docs/accounts.md). */
  admins?: string[];
  /** Researcher access needs a login with a second factor. */
  requireMfa?: boolean;
  /**
   * The built client (`packages/client/dist`): served from this server, so
   * coders and researchers reach one origin (session cookies). Without it
   * (development) Vite serves the client and forwards API paths here.
   */
  clientDir?: string;
}

/**
 * The server: the researcher API (`/job/...`) and the coder API for coders
 * (`/d/<deploymentId>/...`), on one database. A new app on the same
 * database is a restart: runtimes rebuild from the database.
 */
export function createApp(db: Sql, options: AppOptions = {}) {
  const secret = options.secret ?? crypto.randomUUID();
  const server: Server = {
    db,
    deployments: new Deployments(db, secret, { ...DEFAULT_RUNTIME_OPTIONS, ...options.runtime }, options.wrapStore),
    devAuth: options.devAuth ?? false,
    login: options.login ? { oidc: new Oidc(options.login.oidc), publicUrl: options.login.publicUrl.replace(/\/$/, "") } : null,
    secret,
    admins: (options.admins ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
    requireMfa: options.requireMfa ?? false,
  };

  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    // Postgres: a malformed or out-of-range value in a parameter (e.g. an id in the path).
    const pgCode = (err as { code?: unknown }).code;
    if (pgCode === "22P02" || pgCode === "22003") return c.json({ error: "Invalid parameter" }, 400);
    // A unique constraint, e.g. two units with the same external id in one upload.
    if (pgCode === "23505") return c.json({ error: "Already exists" }, 409);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });
  app.get("/health", (c) => c.json({ ok: true, service: "annotinder", contractsVersion: CONTRACTS_VERSION }));

  // Request bodies: a coder sends one unit's answers at a time; a researcher
  // may upload all units at once (each unit is also checked against the
  // server's unit size, shared/limits.ts).
  const tooLarge = (c: Context) => c.json({ error: "The request is too large", code: "request_too_large" }, 413);
  app.use("/d/*", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: tooLarge }));
  app.use("/job/*", bodyLimit({ maxSize: 256 * 1024 * 1024, onError: tooLarge }));
  app.use("/admin/*", bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge }));
  app.use("/me/*", bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }));

  // Coder API (coder.ts): same origin as the client, no CORS.
  app.route("/d/:deployment", coderApi(server));

  // Researcher API (researcher/): full paths, API keys (researcher/auth.ts).
  // CORS, so a client on another origin (e.g. the Vite dev server) can call it.
  // Cookies are same-origin only: CORS here is for API keys.
  for (const path of ["/job", "/job/*", "/me", "/me/*", "/admin/*"]) app.use(path, cors());
  app.route("/", login(server));
  app.route("/", me(server));
  app.route("/", admin(server));
  // Order matters: units/fields and units/page before units/:id.
  app.route("/", examples(server));
  app.route("/", jobs(server));
  app.route("/", job(server));
  app.route("/", jobUsers(server));
  app.route("/", codebooks(server));
  app.route("/", codebook(server));
  app.route("/", units(server));
  app.route("/", unitsFields(server));
  app.route("/", unitsPage(server));
  app.route("/", unit(server));
  app.route("/", sets(server));
  app.route("/", coders(server));
  app.route("/", invites(server));
  app.route("/", overview(server));
  app.route("/", deployment(server));
  app.route("/", deploymentStatus(server));
  app.route("/", deploymentPreview(server));
  app.route("/", annotationsReset(server));
  app.route("/", annotations(server));

  if (options.clientDir) {
    const root = options.clientDir;
    // Built files have hashed names: cached for good.
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.ok) c.header("cache-control", "public, max-age=31536000, immutable");
    });
    app.use("*", serveStatic({ root }));
    // Everything else that isn't an API path is the app (it reads its state from the URL).
    app.get("*", async (c, next) => (API_PATH.test(c.req.path) ? next() : serveStatic({ path: join(root, "index.html") })(c, next)));
  }

  return app;
}

/** Paths of the server's APIs (also what Vite forwards in development: client/vite.config.ts). */
const API_PATH = /^\/(d|job|me|auth|admin|examples|health)(\/|$)/;
