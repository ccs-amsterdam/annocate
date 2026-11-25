import { Hono } from "hono";
import { isPreviewId } from "./runtime/registry.js";
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
import { linkState } from "./shared/links.js";
import { deviceDetails } from "./shared/devices.js";
import { coderStudies } from "./shared/coderStudies.js";
import { and, eq } from "drizzle-orm";
import { sessionDevices, coderSessions } from "./db/schema/index.js";
import { coderKey, newDeviceId, nothingHere, readDevice, requireClientHeader, writeDevice } from "./runtime/session.js";
import {
  coderFromUrl,
  loadRuntime,
  proofOf,
  resolveRequestCoder,
  urlParamsOf,
  versionGuard,
} from "./runtime/requestCoder.js";
import type { Coder, DeploymentRuntime } from "./runtime/runtime.js";
import { idParam, parseJson } from "./shared/request.js";

interface Env {
  /** `deviceId`: the device's row (`session_devices`; null in previews). `canLogIn`: the link offers a login the session hasn't used. */
  Variables: { runtime: DeploymentRuntime; coder: Coder; deviceId: number | null; canLogIn: boolean };
}

/**
 * The coder API (contracts `coderEndpoints`, docs/api/coder.md), under
 * `/d/<deploymentId>`: the study's public id, or `<publicId>.preview`. The client's
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
    const body = await parseJson(c, RedeemTransferSchema);
    const deploymentId = c.req.param("deployment")!;
    const runtime = await server.deployments.admit(deploymentId, { transferToken: body.token });
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
    if (!device || isPreviewId(deploymentId)) throw nothingHere();
    const runtime = await server.deployments.admit(deploymentId, await proofOf(server, c));
    const key = await coderKey(device, deploymentId, coderFromUrl(runtime, urlParamsOf(c)));
    const [study] = await coderStudies(
      server.db,
      and(
        eq(coderSessions.studyId, runtime.studyId),
        eq(
          coderSessions.id,
          server.db
            .select({ id: sessionDevices.sessionId })
            .from(sessionDevices)
            .where(eq(sessionDevices.keyHash, key)),
        ),
      ),
    );
    if (!study) throw nothingHere();
    return c.json(study);
  });

  // A pick-your-name link's names (docs/api/coder.md): never starts a session.
  app.get("/names", async (c) => {
    requireClientHeader(c);
    const secret = c.req.header("x-link-secret");
    const link = secret && !isPreviewId(c.req.param("deployment")!) ? await linkState(server.db, secret) : null;
    if (!link) throw nothingHere();
    const runtime = await loadRuntime(server, c, { linkSecret: secret });
    if (link.studyId !== runtime.studyId) throw nothingHere();
    // Names only for a link that still takes new coders (as starting a session checks)
    if (link.revokedAt) throw new HttpError(403, "This link has been revoked", "link_revoked");
    if (link.retiredAt) throw new HttpError(403, "This link is no longer active", "link_inactive");
    return c.json(await runtime.pickNames());
  });

  const session = new Hono<Env>();
  session.use("*", async (c, next) => {
    requireClientHeader(c);
    const runtime = await loadRuntime(server, c, await proofOf(server, c));
    versionGuard(c, runtime);
    const { coder, deviceId, canLogIn } = await resolveRequestCoder(server, c, runtime);
    c.set("runtime", runtime);
    c.set("coder", coder);
    c.set("deviceId", deviceId);
    c.set("canLogIn", canLogIn);
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
    c.json(await c.get("runtime").loopUnit(c.get("coder"), c.req.param("loop"), idParam(c, "unitId"))),
  );

  session.post("/variables/unit", async (c) => {
    const body = await parseJson(c, PostUnitVariablesSchema);
    return c.json(
      await c
        .get("runtime")
        .submitUnit(c.get("coder"), body.unitId, body.variables, body.loop, c.get("deviceId"), body.timings),
    );
  });

  session.post("/experiment/:name", async (c) =>
    c.json({ value: await c.get("runtime").assignCondition(c.get("coder"), c.req.param("name")) }),
  );

  session.post("/end", async (c) => {
    const body = await parseJson(c, EndSessionSchema);
    return c.json(await c.get("runtime").endSession(c.get("coder"), body.item, body.unit));
  });

  session.post("/reopen", async (c) => {
    await c.get("runtime").reopenSession(c.get("coder"));
    return c.body(null, 204);
  });

  session.post("/display", async (c) => {
    const body = await parseJson(c, DisplayEntrySchema);
    await c.get("runtime").recordDisplay(c.get("coder"), body);
    return c.body(null, 204);
  });

  session.post("/quit", async (c) => {
    const body = await parseJson(c, QuitSessionSchema);
    await c.get("runtime").quitSession(c.get("coder"), body.requestDeletion);
    return c.body(null, 204);
  });

  session.post("/variables/coder", async (c) => {
    const body = await parseJson(c, PostCoderVariablesSchema);
    await c.get("runtime").submitCoderVariables(c.get("coder"), body.variables, c.get("deviceId"), body.timings);
    return c.body(null, 204);
  });

  app.route("/", session);
  return app;
}
