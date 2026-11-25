import { Readable } from "node:stream";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import type { Env, Server } from "./context.js";
import { coderApi } from "./coder.js";
import { coderAccount } from "./coderAccount.js";
import { databaseAnswers, type Db } from "./db/index.js";
import { Oidc, type OidcOptions } from "./oidc.js";
import { admin } from "./researcher/admin.js";
import { annotations } from "./researcher/annotations.js";
import { annotationsReset } from "./researcher/annotations.reset.js";
import { coders } from "./researcher/coders.js";
import { deployment } from "./researcher/deployment.js";
import { deploymentPreview } from "./researcher/deployment.preview.js";
import { deploymentStatus } from "./researcher/deployment.status.js";
import { designVersion } from "./researcher/design.$id.js";
import { designVersions } from "./researcher/design.js";
import { examples } from "./researcher/examples.js";
import { links } from "./researcher/links.js";
import { login } from "./researcher/login.js";
import { me } from "./researcher/me.js";
import { overview } from "./researcher/overview.js";
import { results } from "./researcher/results.js";
import { sets } from "./researcher/sets.js";
import { study } from "./researcher/study.$id.js";
import { studyUsers } from "./researcher/study.$id.users.js";
import { studies } from "./researcher/study.js";
import { studyExports } from "./researcher/studyExport.js";
import { unit } from "./researcher/units.$id.js";
import { unitsFields } from "./researcher/units.fields.js";
import { units } from "./researcher/units.js";
import { unitsPage } from "./researcher/units.page.js";
import { Deployments } from "./runtime/registry.js";
import { DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime/runtime.js";
import type { Store } from "./runtime/store.js";
import { requestBodyLimit } from "./shared/bodyLimit.js";
import { requestLog } from "./shared/requestLog.js";
import type { TrustProxy } from "./shared/clientAddress.js";
import { DiskFileStore, readFileToken, type FileStore } from "./shared/files.js";
import { HttpError, TooManyRequests, logLines, postgresCode } from "./shared/http.js";
import { DEFAULT_RATE_LIMITS, RateLimiter, rateLimit, type RateLimits } from "./shared/rateLimit.js";
import { securityHeaders } from "./shared/securityHeaders.js";
import { CLIENT_VERSION } from "./version.js";

export interface AppOptions {
  /** Signs preview tokens. Random per process if not given (previews then end with a restart). */
  secret?: string;
  /** Where the server keeps files (default: a folder in the system's temp folder). */
  files?: FileStore;
  runtime?: Partial<RuntimeOptions>;
  /** Tests: observe or alter what the runtime reads and writes. */
  wrapStore?: (store: Store) => Store;
  /**
   * Development mode (`AUTH_DEV_MODE`): development auth headers
   * (`x-dev-role`) for the researcher API (researcher/auth.ts). For local
   * development and tests only.
   */
  devMode?: boolean;
  /**
   * Researcher login with an OpenID Connect provider (oidc.ts). `publicUrl`
   * is where browsers reach this server (and the client), e.g.
   * `https://annotinder.com`; the provider redirects to `<publicUrl>/api/auth/callback`.
   */
  login?: { oidc: OidcOptions; publicUrl: string; accountUrl?: string; previous?: { oidc: OidcOptions; until: Date } };
  /** Emails that are admins (docs/accounts.md). */
  admins?: string[];
  /** How recent (seconds) a login's second factor must be for sensitive actions (`AUTH_STEP_UP_MAX_AGE`, default 600). */
  stepUpMaxAge?: number;
  /** Weaker security: `AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` (context.ts). */
  insecure?: Partial<Server["insecure"]>;
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
  /** Rate limits (docs/security.md, shared/rateLimit.ts); absent: none (tests). The server turns them on by default. */
  rateLimits?: Partial<RateLimits>;
  /** What is in front of the server (`ANNOTINDER_TRUST_PROXY`): where the client's address comes from (shared/clientAddress.ts). Default none. */
  trustProxy?: TrustProxy;
  /** Writes a line per API request (shared/requestLog.ts); absent: no request log (tests). The server logs to the console. */
  log?: (line: string) => void;
}

/**
 * The server: the researcher API (`/study/...`) and the coder API for coders
 * (`/d/<deploymentId>/...`), on one database. A new app on the same
 * database is a restart: runtimes rebuild from the database.
 */
export function createApp(db: Db, options: AppOptions = {}) {
  const server = buildServer(db, options);

  const app = new Hono<Env>();
  app.use("*", securityHeaders({ frameAncestors: options.frameAncestors, https: options.https ?? false }));
  // Compressed responses (gzip): JSON and the client's files shrink 5 to 20 times. No BREACH
  // risk: cross-site pages can't make a browser send API requests with its cookies (the
  // x-annotinder header, researcher/auth.ts).
  app.use("*", compress({ encoding: "gzip" }));
  app.onError(errorResponse);
  app.route("/api", api(server, options.log));
  if (options.clientDir) serveClient(app, options.clientDir);
  return app;
}

/** What every endpoint gets, from the options. */
function buildServer(db: Db, options: AppOptions): Server {
  const secret = options.secret ?? crypto.randomUUID();
  return {
    db,
    deployments: new Deployments(db, secret, { ...DEFAULT_RUNTIME_OPTIONS, ...options.runtime }, options.wrapStore),
    devMode: options.devMode ?? false,
    login: options.login
      ? {
          oidc: new Oidc(options.login.oidc),
          publicUrl: options.login.publicUrl.replace(/\/$/, ""),
          accountUrl: options.login.accountUrl ?? null,
          previous: options.login.previous
            ? { oidc: new Oidc(options.login.previous.oidc), until: options.login.previous.until }
            : null,
        }
      : null,
    secret,
    files: options.files ?? new DiskFileStore(),
    admins: (options.admins ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
    stepUpMaxAge: options.stepUpMaxAge ?? 600,
    insecure: {
      disable2fa: options.insecure?.disable2fa ?? false,
      disableEmailVerification: options.insecure?.disableEmailVerification ?? false,
    },
    rateLimiter: options.rateLimits
      ? new RateLimiter(db, { ...DEFAULT_RATE_LIMITS, ...options.rateLimits }, options.trustProxy ?? "none")
      : null,
  };
}

/** The response to an error a handler threw: the API's one error shape (shared/http.ts). */
function errorResponse(err: Error, c: Context<Env>) {
  if (err instanceof TooManyRequests) c.header("Retry-After", String(err.retryAfter));
  if (err instanceof HttpError)
    return c.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.issues ? { issues: err.issues } : {}) },
      err.status,
    );
  const pgCode = postgresCode(err);
  // Postgres: a malformed or out-of-range value in a parameter (e.g. a number in the query).
  if (pgCode === "22P02" || pgCode === "22003") return c.json({ error: "Invalid parameter" }, 400);
  // A unique constraint, e.g. two units with the same external id in one upload.
  if (pgCode === "23505") return c.json({ error: "Already exists" }, 409);
  // Unexpected: logged under the request's id, which the response names
  const requestId = c.get("requestId");
  console.error([`Error in request ${requestId}`, ...logLines(err)].join("\n"));
  return c.json({ error: "Internal error", requestId }, 500);
}

/** The APIs, all under /api (contracts endpoint paths are relative to it). */
function api(server: Server, log: AppOptions["log"]): Hono<Env> {
  const api = new Hono<Env>();
  api.onError(errorResponse);
  api.use("*", requestLog(log));
  healthRoutes(api, server);
  mountLimits(api, server);
  coderRoutes(api, server);
  researcherRoutes(api, server);
  filesRoute(api, server);
  // Anything else under /api: not found, as JSON (never the app)
  api.all("*", (c) => c.json({ error: "Not found" }, 404));
  return api;
}

function healthRoutes(api: Hono<Env>, server: Server): void {
  // Is the process up? Asks nothing of the database, so it stays cheap (the container's own check).
  api.get("/health", (c) => c.json({ ok: true, service: "annotinder", ...CLIENT_VERSION }));
  // Can it serve requests? Also asks the database: for uptime checks and load balancers.
  api.get("/ready", async (c) => {
    const database = await databaseAnswers(server.db);
    return c.json({ ok: database, service: "annotinder", database }, database ? 200 : 503);
  });
}

/** How large a request may be and how many there may be, before any route reads one. */
function mountLimits(api: Hono<Env>, server: Server): void {
  api.use("*", requestBodyLimit());

  // Rate limits (docs/security.md): generous, against floods and guessing. New coder sessions
  // (runtime/store.ts) and researchers once authenticated (researcher/auth.ts) are counted
  // where they are known, with `server.rateLimiter`.
  const limiter = server.rateLimiter;
  for (const path of ["/d/*", "/coder/*"]) api.use(path, rateLimit(limiter, "coder", { memory: true }));
  api.use("/d/:deployment/transfer/redeem", rateLimit(limiter, "transfer"));
  // Logins and their callbacks (against guessing)
  for (const path of ["/auth/login", "/auth/callback"]) api.use(path, rateLimit(limiter, "login"));
  // ("/study/*" also matches "/study")
  for (const path of ["/study/*", "/me/*", "/admin/*"]) api.use(path, rateLimit(limiter, "researcherAddress"));
}

/** The coder API (coder.ts): same origin as the client, no CORS. */
function coderRoutes(api: Hono<Env>, server: Server): void {
  api.route("/d/:deployment", coderApi(server));
  api.route("/", coderAccount(server));
}

/** The researcher API (researcher/): full paths, API keys (researcher/auth.ts). */
function researcherRoutes(api: Hono<Env>, server: Server): void {
  // CORS, so a client on another origin (e.g. the Vite dev server) can call it.
  // Cookies are same-origin only: CORS here is for API keys.
  for (const path of ["/study", "/study/*", "/me", "/me/*", "/admin/*"]) api.use(path, cors());
  // Order matters: units/fields and units/page before units/:id.
  for (const routes of [
    login,
    me,
    admin,
    examples,
    studyExports,
    studies,
    study,
    studyUsers,
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
    results,
  ])
    api.route("/", routes(server));
}

/** Download links (shared/files.ts): the token names the file and expires. */
function filesRoute(api: Hono<Env>, server: Server): void {
  api.get("/files/:token", async (c) => {
    const file = readFileToken(server.secret, c.req.param("token"));
    const size = file && (await server.files.size(file.key));
    if (!file || size === null || size === undefined)
      return c.json({ error: "This download link has expired or doesn't exist", code: "link_expired" }, 404);
    return new Response(Readable.toWeb(server.files.read(file.key)) as ReadableStream, {
      headers: {
        "content-type": "application/zip",
        "content-length": String(size),
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  });
}

/** The built client in `root`: its files, and the app for every other path outside /api. */
function serveClient(app: Hono<Env>, root: string): void {
  // Built files have hashed names: cached for good.
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.header("cache-control", "public, max-age=31536000, immutable");
  });
  app.use("*", serveStatic({ root }));
  // A built file that isn't there (an older version's): not the app's page under its name
  app.get("/assets/*", (c) => c.text("Not found", 404));
  // Everything else outside /api is the app (it reads its state from the URL).
  app.get("*", serveStatic({ path: join(root, "index.html") }));
}
