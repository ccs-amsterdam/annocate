import { Hono } from "hono";
import { ApiKeyWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { createApiKey, ensureUser, listApiKeys, revokeApiKey } from "../shared/accounts.js";

/** The authenticated researcher, and their API keys. */
export function me(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  app.use("/me", requireResearcher(server));
  app.use("/me/*", requireResearcher(server));

  app.get("/me", (c) => c.json({ email: c.get("researcher").email }));

  /** The user behind the request; development headers get one by their email. */
  const userId = async (c: { get(key: "researcher"): Env["Variables"]["researcher"] }) =>
    c.get("researcher").userId ?? (await ensureUser(db, c.get("researcher").email)).id;

  app.get("/me/keys", async (c) => c.json(await listApiKeys(db, await userId(c))));

  app.post("/me/keys", async (c) => {
    const parsed = ApiKeyWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(await createApiKey(db, await userId(c), parsed.data.label), 201);
  });

  app.post("/me/keys/:id/revoke", async (c) => {
    const key = await revokeApiKey(db, await userId(c), Number(c.req.param("id")));
    if (!key) return c.json({ error: "API key not found" }, 404);
    return c.json(key);
  });

  return app;
}
