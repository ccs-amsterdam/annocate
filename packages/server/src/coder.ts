import { Hono, type Context } from "hono";
import { EndSessionSchema, QuitSessionSchema, NextUnitQuerySchema, PostCoderVariablesSchema, PostUnitVariablesSchema, RedeemTransferSchema } from "@annotinder/contracts";
import type { Server } from "./context.js";
import { HttpError } from "./shared/http.js";
import { getCookie } from "hono/cookie";
import { linkInfo, participantFromLink } from "./shared/invites.js";
import { userForSession } from "./shared/sessions.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { dbCoderKey, newSessionKey, readSession, requireClientHeader, sessionCookieName, writeSession } from "./runtime/session.js";
import type { Coder, DeploymentRuntime } from "./runtime/runtime.js";

/** The deployment version the client's codebook belongs to (contracts SessionResponse.version). */
const VERSION_HEADER = "x-annotinder-version";

interface Env {
  /** `sessionKey`: null for a logged-in coder (their login is the session). `canLogIn`: the link offers a login they haven't used. */
  Variables: { runtime: DeploymentRuntime; coder: Coder; sessionKey: string | null; canLogIn: boolean };
}

/**
 * The coder API (contracts `coderEndpoints`, docs/api/coder.md), under
 * `/d/<deploymentId>`: `<jobId>`, or `<jobId>.preview`. The client's
 * `HttpCoderApi` uses `/d/<deploymentId>` as its base URL.
 *
 * No CORS: the client is served from this server's origin, so the browser
 * refuses cross-origin calls that carry the required header.
 */
export function coderApi(server: Server): Hono {
  const app = new Hono();

  // Redeeming a transfer link: this device gets the session's cookie.
  app.post("/transfer/redeem", async (c) => {
    requireClientHeader(c);
    const body = await parseBody(c, RedeemTransferSchema);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.get(deploymentId);
    const sessionKey = runtime.redeemTransfer(body.token);
    // A transfer link carries no invite: the session's cookie for no participant id.
    const name = await sessionCookieName(undefined);
    writeSession(c, deploymentId, name, sessionKey);
    return c.json({});
  });

  const session = new Hono<Env>();
  session.use("*", async (c, next) => {
    requireClientHeader(c);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.get(deploymentId);
    await runtime.refresh();
    c.set("runtime", runtime);
    // The client works with the codebook of the version it loaded; after a
    // publish it must load the session again (the session and transfer
    // links don't depend on the codebook).
    const version = c.req.header(VERSION_HEADER);
    const exempt = c.req.path.endsWith("/session") || c.req.path.endsWith("/transfer");
    if (version !== undefined && version !== String(runtime.version) && !exempt) {
      throw new HttpError(409, "A new version of the codebook was published", "codebook_changed");
    }

    // The session cookie, or a new session: no cookie yet, or the coder asked
    // for a new one (a participant id that already has a session elsewhere).
    // A device keeps a session per participant id: the invite says which URL
    // parameter holds it.
    const inviteSecret = c.req.header("x-invite-secret");
    // The page's query parameters: the participant id and other values the invite requires, and `url_param` auto variables.
    const urlParams = Object.fromEntries(new URLSearchParams(c.req.header("x-url-params") ?? ""));
    const newSession = c.req.header("x-new-session") === "1";
    const link = inviteSecret ? await linkInfo(server.db, inviteSecret) : null;
    // A login (the same as researchers', docs/coder-identity.md §5) counts
    // where the invite takes logins, and when coming back without the link.
    // Never in previews.
    const loginKey = getCookie(c, SESSION_COOKIE);
    const user = loginKey && /^\d+$/.test(deploymentId) && link?.login !== "none" ? await userForSession(server.db, loginKey) : null;
    const login = user ? { key: `login:${user.id}:${deploymentId}`, email: user.email, adopt: link !== null } : undefined;
    const name = await sessionCookieName(participantFromLink(link, urlParams));
    const existing = newSession ? undefined : readSession(c, name);
    const sessionKey = existing ?? newSessionKey();
    const coder = await runtime.resolveCoder({ coderKey: await dbCoderKey(sessionKey), inviteSecret, urlParams, newSession, login }, urlParams);
    const viaLogin = coder.login !== null && login !== undefined;
    // Only once the coder was accepted (an invite may be invalid or used up), and not for a login.
    if (!viaLogin && sessionKey !== existing) writeSession(c, deploymentId, name, sessionKey);
    c.set("sessionKey", viaLogin ? null : sessionKey);
    c.set("canLogIn", !!server.login && link?.login === "optional" && !viaLogin);
    c.set("coder", coder);
    await next();
  });

  session.post("/transfer", (c) => {
    const key = c.get("sessionKey");
    if (key === null) throw new HttpError(400, "You are logged in: log in on the other device to continue there");
    return c.json(c.get("runtime").createTransfer(key));
  });

  session.get("/session", (c) => c.json({ ...c.get("runtime").session(c.get("coder")), canLogIn: c.get("canLogIn") }));

  session.get("/loop/:loop/next", async (c) => {
    const query = NextUnitQuerySchema.safeParse({ branch: c.req.query("branch"), unitsets: c.req.queries("unitsets") });
    if (!query.success) return c.json({ error: "Invalid branch or unitsets" }, 400);
    const { branch, unitsets } = query.data;
    const names = unitsets === undefined ? [] : Array.isArray(unitsets) ? unitsets : [unitsets];
    return c.json(await c.get("runtime").nextUnit(c.get("coder"), c.req.param("loop"), { branch, unitsets: names }));
  });

  session.get("/loop/:loop/units/:unitId", async (c) =>
    c.json(await c.get("runtime").loopUnit(c.get("coder"), c.req.param("loop"), Number(c.req.param("unitId")))),
  );

  session.post("/variables/unit", async (c) => {
    const body = await parseBody(c, PostUnitVariablesSchema);
    await c.get("runtime").submitUnit(c.get("coder"), body.unitId, body.variables, body.loop);
    return c.body(null, 204);
  });

  session.post("/end", async (c) => {
    const body = await parseBody(c, EndSessionSchema);
    await c.get("runtime").endSession(c.get("coder"), body.item, body.unit);
    return c.body(null, 204);
  });

  session.post("/quit", async (c) => {
    const body = await parseBody(c, QuitSessionSchema);
    await c.get("runtime").quitSession(c.get("coder"), body.requestDeletion);
    return c.body(null, 204);
  });

  session.post("/variables/coder", async (c) => {
    const body = await parseBody(c, PostCoderVariablesSchema);
    await c.get("runtime").submitCoderVariables(c.get("coder"), body.variables);
    return c.body(null, 204);
  });

  app.route("/", session);
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
