import { Hono, type Context } from "hono";
import { ApiKeyWriteSchema, ResearcherRequestWriteSchema, type MeResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { identities, researcherRequests } from "../db/schema/index.js";
import { freshUntil, requireResearcher, requireSensitive } from "./auth.js";
import { HttpError } from "../shared/http.js";
import { createApiKey, effectiveLimits, getSettings, listApiKeys, revokeApiKey, usage } from "../shared/accounts.js";

/** The authenticated user: their account (role, limits), becoming a researcher, and their API keys. */
export function me(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const signedIn = requireResearcher(server);

  /** The user behind the request. */
  const userId = (c: Context<Env>) => c.get("researcher").userId;

  /** While moving to another provider: the user has no identity at the current one yet. */
  async function linkNeeded(id: number): Promise<boolean> {
    const login = server.login;
    if (!login?.previous || Date.now() >= login.previous.until.getTime()) return false;
    const current = login.oidc.issuer.replace(/\/+$/, "");
    return (
      (await db.$count(identities, and(eq(identities.userId, id), sql`rtrim(${identities.iss}, '/') = ${current}`))) ===
      0
    );
  }

  async function meResponse(c: Context<Env>): Promise<MeResponse> {
    const researcher = c.get("researcher");
    const id = userId(c);
    const [request] = await db
      .select({ at: researcherRequests.at })
      .from(researcherRequests)
      .where(and(eq(researcherRequests.userId, id), isNull(researcherRequests.decidedAt)));
    return {
      email: researcher.email,
      role: researcher.accountRole,
      limits: await effectiveLimits(db, id),
      usage: await usage(db, id),
      researcherRequest: request ? { at: request.at } : null,
      canRequestResearcher: (await getSettings(db)).registration.requests,
      twoFactor: {
        enabled: !server.insecure.disable2fa,
        used: researcher.mfa,
        setupUrl: server.login?.accountUrl ?? null,
        adminOff: researcher.adminOff ?? false,
        freshUntil: freshUntil(server, researcher),
      },
      linkNeeded: await linkNeeded(id),
    };
  }

  app.get("/me", signedIn, async (c) => c.json(await meResponse(c)));

  app.post("/me/researcher-request", signedIn, async (c) => {
    const parsed = ResearcherRequestWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    if (c.get("researcher").accountRole !== "user") throw new HttpError(409, "You are a researcher already");
    if (!(await getSettings(db)).registration.requests)
      throw new HttpError(403, "This server doesn't take requests: ask its admins to invite your email address");
    await db
      .insert(researcherRequests)
      .values({ userId: userId(c), message: parsed.data.message })
      .onConflictDoUpdate({
        target: researcherRequests.userId,
        set: { message: sql`excluded.message`, at: sql`now()`, decidedAt: null, decidedBy: null, approved: null },
      });
    return c.json(await meResponse(c));
  });

  app.get("/me/keys", signedIn, async (c) => c.json(await listApiKeys(db, userId(c))));

  // Sensitive: only in a web session with a recent second factor (step-up), never with an API key
  app.post("/me/keys", signedIn, requireSensitive(server), async (c) => {
    const parsed = ApiKeyWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(await createApiKey(db, userId(c), parsed.data.label), 201);
  });

  app.post("/me/keys/:id/revoke", signedIn, requireSensitive(server), async (c) => {
    const key = await revokeApiKey(db, userId(c), Number(c.req.param("id")));
    if (!key) return c.json({ error: "API key not found" }, 404);
    return c.json(key);
  });

  return app;
}
