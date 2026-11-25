import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { parseJson } from "../shared/request.js";
import { ServerSettingsSchema } from "@annotinder/contracts";
import { roles, serverSettings } from "../db/schema/index.js";
import { everyoneResearcher, getSettings } from "../shared/accounts.js";
import { adminLogger } from "../shared/adminQueries.js";
import { serverWarnings } from "../shared/warnings.js";

/** The server's hardening warnings and its settings. */
export function adminSettings(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const log = adminLogger(db);

  app.get("/admin/warnings", async (c) => c.json(await serverWarnings(server)));

  app.get("/admin/settings", async (c) => c.json(await getSettings(db)));

  app.put("/admin/settings", async (c) => {
    const settings = await parseJson(c, ServerSettingsSchema);
    await getSettings(db); // the row exists
    // Open registration is a role: researcher, for every user with an email address
    await db.delete(roles).where(everyoneResearcher);
    if (settings.registration.open)
      await db.insert(roles).values({ role: "researcher", grantedBy: c.get("researcher").email });
    await db.update(serverSettings).set({
      registration: { requests: settings.registration.requests },
      defaultPlanId: settings.defaultPlanId,
      unitBytes: settings.unitBytes,
      answerBytes: settings.answerBytes,
    });
    await log(c, "settings", "server", settings);
    return c.json(await getSettings(db));
  });

  return app;
}
