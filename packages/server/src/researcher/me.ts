import { Hono, type Context } from "hono";
import { ApiKeyWriteSchema, ResearcherRequestWriteSchema, type MeResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { one } from "../db.js";
import { freshUntil, lacksMfa, requireResearcher, requireSensitive } from "./auth.js";
import { HttpError } from "../shared/http.js";
import { createApiKey, effectiveLimits, getSettings, listApiKeys, revokeApiKey, usage } from "../shared/accounts.js";

/** The authenticated user: their account (role, limits), becoming a researcher, and their API keys. */
export function me(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  // `GET /me` also answers a login without a required second factor, so the UI can say so.
  const signedIn = requireResearcher(server);

  /** The user behind the request. */
  const userId = async (c: Context<Env>) => c.get("researcher").userId;

  /** While moving to another provider: the user has no identity at the current one yet. */
  async function linkNeeded(id: number): Promise<boolean> {
    const login = server.login;
    if (!login?.previous || Date.now() >= login.previous.until.getTime()) return false;
    const current = login.oidc.issuer.replace(/\/+$/, "");
    return !(await one(db, "SELECT 1 FROM identities WHERE user_id = $1 AND rtrim(iss, '/') = $2", [id, current]));
  }

  async function meResponse(c: Context<Env>): Promise<MeResponse> {
    const researcher = c.get("researcher");
    const id = await userId(c);
    const request = await one<{ at: Date }>(
      db,
      "SELECT at FROM researcher_requests WHERE user_id = $1 AND decided_at IS NULL",
      [id],
    );
    return {
      email: researcher.email,
      role: researcher.accountRole,
      limits: await effectiveLimits(db, id),
      usage: await usage(db, id),
      researcherRequest: request ? { at: request.at } : null,
      canRequestResearcher: (await getSettings(db)).registration.requests,
      twoFactor: { required: lacksMfa(researcher), freshUntil: freshUntil(server, researcher) },
      linkNeeded: await linkNeeded(id),
    };
  }

  app.get("/me", requireResearcher(server, { withoutMfa: true }), async (c) => c.json(await meResponse(c)));

  app.post("/me/researcher-request", signedIn, async (c) => {
    const parsed = ResearcherRequestWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    if (c.get("researcher").accountRole !== "user") throw new HttpError(409, "You are a researcher already");
    if (!(await getSettings(db)).registration.requests)
      throw new HttpError(403, "This server doesn't take requests: ask for an invite link");
    await db.query(
      `INSERT INTO researcher_requests (user_id, message) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET message = excluded.message, at = now(), decided_at = NULL, decided_by = NULL, approved = NULL`,
      [await userId(c), parsed.data.message],
    );
    return c.json(await meResponse(c));
  });

  app.get("/me/keys", signedIn, async (c) => c.json(await listApiKeys(db, await userId(c))));

  // Sensitive: only in a web session with a recent second factor (step-up), never with an API key
  app.post("/me/keys", signedIn, requireSensitive(server), async (c) => {
    const parsed = ApiKeyWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(await createApiKey(db, await userId(c), parsed.data.label), 201);
  });

  app.post("/me/keys/:id/revoke", signedIn, requireSensitive(server), async (c) => {
    const key = await revokeApiKey(db, await userId(c), Number(c.req.param("id")));
    if (!key) return c.json({ error: "API key not found" }, 404);
    return c.json(key);
  });

  return app;
}
