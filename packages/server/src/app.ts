import { Hono } from "hono";
import { cors } from "hono/cors";
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
import { login } from "./researcher/login.js";
import { Oidc, type OidcOptions } from "./oidc.js";
import { codebook } from "./researcher/codebook.$id.js";
import { codebooks } from "./researcher/codebook.js";
import { coders } from "./researcher/coders.js";
import { deploymentPreview } from "./researcher/deployment.preview.js";
import { deploymentRefresh } from "./researcher/deployment.refresh.js";
import { deploymentStatus } from "./researcher/deployment.status.js";
import { deployment } from "./researcher/deployment.js";
import { inviteRevoke } from "./researcher/invites.$id.revoke.js";
import { invite } from "./researcher/invites.$id.js";
import { invites } from "./researcher/invites.js";
import { job } from "./researcher/job.$id.js";
import { jobUsers } from "./researcher/job.$id.users.js";
import { jobs } from "./researcher/job.js";
import { overview } from "./researcher/overview.js";
import { unit } from "./researcher/units.$id.js";
import { unitset } from "./researcher/unitsets.$id.js";
import { unitsets } from "./researcher/unitsets.js";
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
  app.get("/", (c) => c.json({ ok: true, service: "annotinder", contractsVersion: CONTRACTS_VERSION }));

  // Coder API (coder.ts): same origin as the client, no CORS.
  app.route("/d/:deployment", coderApi(server));

  // Researcher API (researcher/): full paths, API keys (researcher/auth.ts).
  // CORS, so a client on another origin (e.g. the Vite dev server) can call it.
  // Cookies are same-origin only: CORS here is for API keys.
  for (const path of ["/job", "/job/*", "/me", "/me/*"]) app.use(path, cors());
  app.route("/", login(server));
  app.route("/", me(server));
  // Order matters: units/fields and units/page before units/:id.
  app.route("/", jobs(server));
  app.route("/", job(server));
  app.route("/", jobUsers(server));
  app.route("/", codebooks(server));
  app.route("/", codebook(server));
  app.route("/", units(server));
  app.route("/", unitsFields(server));
  app.route("/", unitsPage(server));
  app.route("/", unit(server));
  app.route("/", unitsets(server));
  app.route("/", unitset(server));
  app.route("/", coders(server));
  app.route("/", invites(server));
  app.route("/", invite(server));
  app.route("/", inviteRevoke(server));
  app.route("/", overview(server));
  app.route("/", deployment(server));
  app.route("/", deploymentStatus(server));
  app.route("/", deploymentRefresh(server));
  app.route("/", deploymentPreview(server));
  app.route("/", annotationsReset(server));
  app.route("/", annotations(server));

  return app;
}
