import { Hono, type Context } from "hono";
import { EndSessionSchema, QuitSessionSchema, NextUnitQuerySchema, PostCoderVariablesSchema, PostUnitVariablesSchema, RedeemTransferSchema } from "@annotinder/contracts";
import type { Server } from "./context.js";
import { HttpError } from "./shared/http.js";
import { getCookie } from "hono/cookie";
import { linkInfo } from "./shared/invites.js";
import { userForSession } from "./shared/sessions.js";
import { deviceDetails } from "./shared/devices.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { coderKey, newDeviceId, readDevice, requireClientHeader, writeDevice } from "./runtime/session.js";
import type { Coder, DeploymentRuntime } from "./runtime/runtime.js";

/** The deployment version the client's codebook belongs to (contracts SessionResponse.version). */
const VERSION_HEADER = "x-annotinder-version";

interface Env {
  /** `deviceId`: the device's row (`coder_devices`; null in previews). `canLogIn`: the link offers a login the session hasn't used. */
  Variables: { runtime: DeploymentRuntime; coder: Coder; deviceId: number | null; canLogIn: boolean };
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

  // Redeeming a transfer link: this device joins the session. Its keys: for
  // coming back without a link, and (with a participant id) with the
  // participant's link.
  app.post("/transfer/redeem", async (c) => {
    requireClientHeader(c);
    const body = await parseBody(c, RedeemTransferSchema);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.get(deploymentId);
    // A suspended or deleted job (stamp changed in another process) takes no new devices.
    await runtime.refresh();
    const device = readDevice(c) ?? newDeviceId();
    await runtime.redeemTransfer(
      body.token,
      async (participant) => [...new Set([await coderKey(device, deploymentId), await coderKey(device, deploymentId, participant)])],
      deviceDetails(c.req.header("user-agent")),
    );
    writeDevice(c, device);
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

    // The device's session in this deployment (docs/coder-identity.md §4):
    // its key is the hash of the device id, the deployment and the
    // participant id the link carries (a device keeps a session per
    // participant id). `x-new-session`: the coder asked for a new one (a
    // participant id that already has a session elsewhere).
    const inviteSecret = c.req.header("x-invite-secret");
    // The page's query parameters: the participant id and the codebook's URL parameters.
    const urlParams = Object.fromEntries(new URLSearchParams(c.req.header("x-url-params") ?? ""));
    const newSession = c.req.header("x-new-session") === "1";
    const link = inviteSecret ? await linkInfo(server.db, inviteSecret) : null;
    const existingDevice = readDevice(c);
    const device = existingDevice ?? newDeviceId();
    const participantParam = runtime.participantParam;
    const key = await coderKey(device, deploymentId, participantParam ? urlParams[participantParam]?.trim() || undefined : undefined);
    // Logins matter where the link takes them, or where sets are assigned by email.
    const takesLogin = !!link && (link.login !== "none" || runtime.needsLogin);
    // A login (the same as researchers', §5) is read only when it matters:
    // to link a session to its email once, or to find the email's session on
    // a new device. Never in previews.
    const loginCookie = getCookie(c, SESSION_COOKIE);
    const login =
      loginCookie && /^\d+$/.test(deploymentId) && (!link || takesLogin)
        ? async () => {
            const user = await userForSession(server.db, loginCookie);
            return user ? { email: user.email } : null;
          }
        : undefined;
    const { coder, deviceId } = await runtime.resolveCoder({
      coderKey: key,
      inviteSecret,
      urlParams,
      newSession,
      device: deviceDetails(c.req.header("user-agent")),
      login,
      linkable: takesLogin,
    });
    // Only once the coder was accepted (an invite may be invalid or used up).
    if (device !== existingDevice) writeDevice(c, device);
    c.set("deviceId", deviceId);
    c.set("canLogIn", !!server.login && link?.login === "optional" && coder.email === null);
    c.set("coder", coder);
    await next();
  });

  session.post("/transfer", async (c) => c.json(await c.get("runtime").createTransfer(c.get("coder"))));

  session.get("/session", async (c) => c.json({ ...(await c.get("runtime").session(c.get("coder"))), canLogIn: c.get("canLogIn") }));

  session.get("/loop/:loop/next", async (c) => {
    const query = NextUnitQuerySchema.safeParse({ branch: c.req.query("branch"), count: c.req.query("count") });
    if (!query.success) return c.json({ error: "Invalid branch or count" }, 400);
    const { branch, count } = query.data;
    return c.json({ units: await c.get("runtime").nextUnits(c.get("coder"), c.req.param("loop"), { branch }, count) });
  });

  session.get("/loop/:loop/units/:unitId", async (c) =>
    c.json(await c.get("runtime").loopUnit(c.get("coder"), c.req.param("loop"), Number(c.req.param("unitId")))),
  );

  session.post("/variables/unit", async (c) => {
    const body = await parseBody(c, PostUnitVariablesSchema);
    return c.json(await c.get("runtime").submitUnit(c.get("coder"), body.unitId, body.variables, body.loop, c.get("deviceId"), body.timings));
  });

  session.post("/variables/auto/:name", async (c) => c.json({ value: await c.get("runtime").assignAuto(c.get("coder"), c.req.param("name")) }));

  session.post("/end", async (c) => {
    const body = await parseBody(c, EndSessionSchema);
    return c.json(await c.get("runtime").endSession(c.get("coder"), body.item, body.unit));
  });

  session.post("/reopen", async (c) => {
    await c.get("runtime").reopenSession(c.get("coder"));
    return c.body(null, 204);
  });

  session.post("/quit", async (c) => {
    const body = await parseBody(c, QuitSessionSchema);
    await c.get("runtime").quitSession(c.get("coder"), body.requestDeletion);
    return c.body(null, 204);
  });

  session.post("/variables/coder", async (c) => {
    const body = await parseBody(c, PostCoderVariablesSchema);
    await c.get("runtime").submitCoderVariables(c.get("coder"), body.variables, c.get("deviceId"), body.timings);
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
