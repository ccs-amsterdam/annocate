import { Hono, type Context } from "hono";
import {
  EndSessionSchema,
  QuitSessionSchema,
  DisplayEntrySchema,
  NextUnitQuerySchema,
  PostCoderVariablesSchema,
  PostUnitVariablesSchema,
  RedeemTransferSchema,
} from "@annotinder/contracts";
import type { Server } from "./context.js";
import { HttpError } from "./shared/http.js";
import { getCookie } from "hono/cookie";
import { linkInfo } from "./shared/links.js";
import { userForSession } from "./shared/sessions.js";
import { deviceDetails } from "./shared/devices.js";
import { coderStudies } from "./shared/coderStudies.js";
import { and, eq } from "drizzle-orm";
import { sessionDevices, coderSessions } from "./db/schema/index.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { coderKey, newDeviceId, readDevice, requireClientHeader, writeDevice } from "./runtime/session.js";
import type { Coder, DeploymentRuntime } from "./runtime/runtime.js";

/** The deployment version the client's codebook belongs to (contracts SessionResponse.version). */
const VERSION_HEADER = "x-annotinder-version";

interface Env {
  /** `deviceId`: the device's row (`session_devices`; null in previews). `canLogIn`: the link offers a login the session hasn't used. */
  Variables: { runtime: DeploymentRuntime; coder: Coder; deviceId: number | null; canLogIn: boolean };
}

/**
 * The coder API (contracts `coderEndpoints`, docs/api/coder.md), under
 * `/d/<deploymentId>`: `<studyId>`, or `<studyId>.preview`. The client's
 * `HttpCoderApi` uses `/d/<deploymentId>` as its base URL.
 *
 * No CORS: the client is served from this server's origin, so the browser
 * refuses cross-origin calls that carry the required header.
 */
export function coderApi(server: Server): Hono {
  const app = new Hono();

  // Redeeming a transfer link: this device joins the session. Its keys: for
  // coming back without a link, and (with a coder id) with the
  // coder's link.
  app.post("/transfer/redeem", async (c) => {
    requireClientHeader(c);
    const body = await parseBody(c, RedeemTransferSchema);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.get(deploymentId);
    // A suspended or deleted study (stamp changed in another process) takes no new devices.
    await runtime.refresh();
    const device = readDevice(c) ?? newDeviceId();
    await runtime.redeemTransfer(
      body.token,
      async (coder) => [
        ...new Set([await coderKey(device, deploymentId), await coderKey(device, deploymentId, coder)]),
      ],
      deviceDetails(c.req.header("user-agent")),
    );
    writeDevice(c, device);
    return c.json({});
  });

  // This device's session here, for the coder home: never starts one (docs/api/coder.md).
  app.get("/summary", async (c) => {
    requireClientHeader(c);
    const deploymentId = c.req.param("deployment")!;
    const device = readDevice(c);
    if (!device || !/^\d+$/.test(deploymentId)) throw new HttpError(404, "No session here");
    const runtime = await server.deployments.get(deploymentId);
    const key = await coderKey(device, deploymentId, coderFromUrl(runtime, urlParamsOf(c)));
    const [study] = await coderStudies(
      server.db,
      and(
        eq(coderSessions.studyId, Number(deploymentId)),
        eq(
          coderSessions.id,
          server.db
            .select({ id: sessionDevices.sessionId })
            .from(sessionDevices)
            .where(eq(sessionDevices.keyHash, key)),
        ),
      ),
    );
    if (!study) throw new HttpError(404, "No session here");
    return c.json(study);
  });

  // A pick-your-name link's names (docs/api/coder.md): never starts a session.
  app.get("/names", async (c) => {
    requireClientHeader(c);
    const deploymentId = c.req.param("deployment")!;
    const secret = c.req.header("x-link-secret");
    const link = secret && /^\d+$/.test(deploymentId) ? await linkInfo(server.db, secret) : null;
    if (!link || String(link.studyId) !== deploymentId)
      throw new HttpError(404, "This link doesn't exist", "link_not_found");
    const runtime = await server.deployments.get(deploymentId);
    await runtime.refresh();
    return c.json(await runtime.pickNames());
  });

  const session = new Hono<Env>();
  session.use("*", async (c, next) => {
    requireClientHeader(c);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.get(deploymentId);
    await runtime.refresh();
    c.set("runtime", runtime);
    // The client works with the codebook of the version it loaded; after a
    // deploy it must load the session again (the session and transfer
    // links don't depend on the design).
    const version = c.req.header(VERSION_HEADER);
    const exempt = c.req.path.endsWith("/session") || c.req.path.endsWith("/transfer");
    if (version !== undefined && version !== String(runtime.version) && !exempt) {
      throw new HttpError(409, "A new version of the study was deployed", "codebook_changed");
    }

    // The device's session in this deployment (docs/coder-identity.md §4):
    // its key is the hash of the device id, the deployment and the
    // coder id the link carries (a device keeps a session per
    // coder id). `x-new-session`: the coder asked for a new one (a
    // coder id that already has a session elsewhere).
    const linkSecret = c.req.header("x-link-secret");
    const urlParams = urlParamsOf(c);
    const newSession = c.req.header("x-new-session") === "1";
    const link = linkSecret ? await linkInfo(server.db, linkSecret) : null;
    const existingDevice = readDevice(c);
    const device = existingDevice ?? newDeviceId();
    const key = await coderKey(device, deploymentId, coderFromUrl(runtime, urlParams));
    // A login (the same as researchers', §5) is read only when it matters:
    // to link a session to its email once, or to find the email's session on
    // a new device. Never in previews.
    const loginCookie = getCookie(c, SESSION_COOKIE);
    const login =
      loginCookie && /^\d+$/.test(deploymentId)
        ? async () => {
            const user = await userForSession(server.db, loginCookie);
            return user ? { email: user.email } : null;
          }
        : undefined;
    const { coder, deviceId } = await runtime.resolveCoder({
      coderKey: key,
      linkSecret,
      urlParams,
      newSession,
      device: deviceDetails(c.req.header("user-agent")),
      login,
      // Coders can always sign in on a link (to continue on other devices); where the study requires it, they must.
      linkable: !!link,
      pickedName: pickedName(c.req.header("x-coder-name")),
    });
    // Only once the coder was accepted (a link may be invalid or used up).
    if (device !== existingDevice) writeDevice(c, device);
    c.set("deviceId", deviceId);
    c.set("canLogIn", !!server.login && !!link && coder.email === null);
    c.set("coder", coder);
    await next();
  });

  session.post("/transfer", async (c) => c.json(await c.get("runtime").createTransfer(c.get("coder"))));

  session.get("/session", async (c) =>
    c.json({ ...(await c.get("runtime").session(c.get("coder"))), canLogIn: c.get("canLogIn") }),
  );

  session.get("/loop/:loop/next", async (c) => {
    const query = NextUnitQuerySchema.safeParse({ count: c.req.query("count") });
    if (!query.success) return c.json({ error: "Invalid count" }, 400);
    return c.json({ units: await c.get("runtime").nextUnits(c.get("coder"), c.req.param("loop"), query.data.count) });
  });

  session.get("/loop/:loop/units/:unitId", async (c) =>
    c.json(await c.get("runtime").loopUnit(c.get("coder"), c.req.param("loop"), Number(c.req.param("unitId")))),
  );

  session.post("/variables/unit", async (c) => {
    const body = await parseBody(c, PostUnitVariablesSchema);
    return c.json(
      await c
        .get("runtime")
        .submitUnit(c.get("coder"), body.unitId, body.variables, body.loop, c.get("deviceId"), body.timings),
    );
  });

  session.post("/variables/computed/:name", async (c) =>
    c.json({ value: await c.get("runtime").computeVariable(c.get("coder"), c.req.param("name")) }),
  );

  session.post("/end", async (c) => {
    const body = await parseBody(c, EndSessionSchema);
    return c.json(await c.get("runtime").endSession(c.get("coder"), body.item, body.unit));
  });

  session.post("/reopen", async (c) => {
    await c.get("runtime").reopenSession(c.get("coder"));
    return c.body(null, 204);
  });

  session.post("/display", async (c) => {
    const body = await parseBody(c, DisplayEntrySchema);
    await c.get("runtime").recordDisplay(c.get("coder"), body);
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

async function parseBody<T>(
  c: Context,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
) {
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

/** The page's query parameters (`x-url-params`): the coder id and the design's URL parameters. */
function urlParamsOf(c: Context): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(c.req.header("x-url-params") ?? ""));
}

/** The coder id a crowd's URL parameter carries (`coderParam`), if any. */
function coderFromUrl(runtime: DeploymentRuntime, urlParams: Record<string, string>): string | undefined {
  const param = runtime.coderParam;
  return param ? urlParams[param]?.trim() || undefined : undefined;
}

/** The name a coder picked on a pick-your-name link (`x-coder-name`, URL-encoded), if any. */
function pickedName(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    return decodeURIComponent(header).trim().slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}
