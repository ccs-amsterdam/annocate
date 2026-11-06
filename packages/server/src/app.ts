import { passkeys } from "./researcher/passkeys.js";
import type { TwoFactorMode } from "@annotinder/contracts";
import { createHash } from "node:crypto";
import { getCookie } from "hono/cookie";
import { DEFAULT_RATE_LIMITS, RateLimiter, rateLimit, type RateLimits } from "./shared/rateLimit.js";
import { readDevice } from "./runtime/session.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { securityHeaders } from "./shared/securityHeaders.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Sql } from "./db.js";
import { CLIENT_VERSION } from "./version.js";
import type { Env, Server } from "./context.js";
import { coderApi } from "./coder.js";
import { coderAccount } from "./coderAccount.js";
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
import { designVersion } from "./researcher/design.$id.js";
import { designVersions } from "./researcher/design.js";
import { coders } from "./researcher/coders.js";
import { deploymentPreview } from "./researcher/deployment.preview.js";
import { deploymentStatus } from "./researcher/deployment.status.js";
import { deployment } from "./researcher/deployment.js";
import { links } from "./researcher/links.js";
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
   * `https://annotinder.com`; the provider redirects to `<publicUrl>/api/auth/callback`.
   */
  login?: { oidc: OidcOptions; publicUrl: string };
  /** Emails that are admins (docs/accounts.md). */
  admins?: string[];
  /** Researcher access needs a login with a second factor. */
  twoFactor?: TwoFactorMode;
  /**
   * The built client (`packages/client/dist`): served from this server, so
   * coders and researchers reach one origin (session cookies). Without it
   * (development) Vite serves the client and forwards API paths here.
   */
  clientDir?: string;
  /** Origins that may show AnnoTinder in a frame besides itself (`ANNOTINDER_FRAME_ANCESTORS`), e.g. AmCAT's. */
  frameAncestors?: string[];
  /** Browsers reach the server over HTTPS (`ANNOTINDER_PUBLIC_URL`): sends HSTS. */
  https?: boolean;
  /** Rate limits per minute (docs/security.md); absent: none (tests). The server turns them on by default. */
  rateLimits?: Partial<RateLimits>;
  /** Behind a proxy that sets X-Forwarded-For (`ANNOTINDER_TRUST_PROXY`): the client's address comes from it. */
  trustProxy?: boolean;
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
    twoFactor: options.twoFactor ?? "none",
  };

  const app = new Hono<Env>();
  app.use("*", securityHeaders({ frameAncestors: options.frameAncestors, https: options.https ?? false }));
  const onError = (err: Error, c: Context) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    // Postgres: a malformed or out-of-range value in a parameter (e.g. an id in the path).
    const pgCode = (err as { code?: unknown }).code;
    if (pgCode === "22P02" || pgCode === "22003") return c.json({ error: "Invalid parameter" }, 400);
    // A unique constraint, e.g. two units with the same external id in one upload.
    if (pgCode === "23505") return c.json({ error: "Already exists" }, 409);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  };
  app.onError(onError);

  // The APIs, all under /api (contracts endpoint paths are relative to it)
  const api = new Hono<Env>();
  api.onError(onError);
  api.get("/health", (c) => c.json({ ok: true, service: "annotinder", ...CLIENT_VERSION }));

  // Request bodies: a coder sends one unit's answers at a time; a researcher
  // may upload all units at once (each unit is also checked against the
  // server's unit size, shared/limits.ts).
  const tooLarge = (c: Context) => c.json({ error: "The request is too large", code: "request_too_large" }, 413);
  api.use("/d/*", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: tooLarge }));
  api.use("/job/*", bodyLimit({ maxSize: 256 * 1024 * 1024, onError: tooLarge }));
  api.use("/admin/*", bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge }));
  api.use("/me/*", bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }));

  // Rate limits (docs/security.md): generous, against floods and guessing.
  const limiter = options.rateLimits ? new RateLimiter(db, { ...DEFAULT_RATE_LIMITS, ...options.rateLimits }, options.trustProxy ?? false) : null;
  api.use("/d/*", rateLimit(limiter, "coder", { memory: true }));
  api.use("/d/*", rateLimit(limiter, "coderStart", { when: (c) => !readDevice(c) }));
  api.use("/d/*", rateLimit(limiter, "transfer", { when: (c) => c.req.path.endsWith("/transfer/redeem") }));
  // Logins, and confirming one with a passkey or a recovery code (against guessing)
  for (const path of ["/auth/login", "/auth/callback", "/auth/passkey/*"]) api.use(path, rateLimit(limiter, "login"));
  // Per account: the API key or login session (hashed: no secrets in the table), else per address.
  const accountKey = (c: Context) => {
    const credential = c.req.header("authorization") ?? getCookie(c, SESSION_COOKIE);
    return credential ? `account:${createHash("sha256").update(credential).digest("hex").slice(0, 32)}` : null;
  };
  // ("/job/*" also matches "/job")
  for (const path of ["/job/*", "/me/*", "/admin/*"]) api.use(path, rateLimit(limiter, "researcher", { key: accountKey }));

  // Coder API (coder.ts): same origin as the client, no CORS.
  api.use("/coder/*", rateLimit(limiter, "coder", { memory: true }));
  api.route("/d/:deployment", coderApi(server));
  api.route("/", coderAccount(server));

  // Researcher API (researcher/): full paths, API keys (researcher/auth.ts).
  // CORS, so a client on another origin (e.g. the Vite dev server) can call it.
  // Cookies are same-origin only: CORS here is for API keys.
  for (const path of ["/job", "/job/*", "/me", "/me/*", "/admin/*"]) api.use(path, cors());
  // Order matters: units/fields and units/page before units/:id.
  for (const routes of [
    login,
    passkeys,
    me,
    admin,
    examples,
    jobs,
    job,
    jobUsers,
    designVersions,
    designVersion,
    units,
    unitsFields,
    unitsPage,
    unit,
    sets,
    coders,
    links,
    overview,
    deployment,
    deploymentStatus,
    deploymentPreview,
    annotationsReset,
    annotations,
  ])
    api.route("/", routes(server));
  // Anything else under /api: not found, as JSON (never the app)
  api.all("*", (c) => c.json({ error: "Not found" }, 404));
  app.route("/api", api);

  if (options.clientDir) {
    const root = options.clientDir;
    // Built files have hashed names: cached for good.
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.ok) c.header("cache-control", "public, max-age=31536000, immutable");
    });
    app.use("*", serveStatic({ root }));
    // Everything else outside /api is the app (it reads its state from the URL).
    app.get("*", serveStatic({ path: join(root, "index.html") }));
  }

  return app;
}
