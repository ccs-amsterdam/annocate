import { Hono, type Context } from "hono";
import { ApiKeyWriteSchema, RedeemResearcherInviteSchema, ResearcherRequestWriteSchema, type MeResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { one } from "../db.js";
import { requireResearcher } from "./auth.js";
import { HttpError } from "../shared/http.js";
import { createApiKey, effectiveLimits, ensureUser, getSettings, listApiKeys, revokeApiKey, usage } from "../shared/accounts.js";

/** The authenticated user: their account (role, limits), becoming a researcher, and their API keys. */
export function me(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  // `GET /me` also answers a login without a required second factor, so the UI can say so.
  const signedIn = requireResearcher(server);

  /** The user behind the request; development headers get one by their email. */
  const userId = async (c: Context<Env>) => c.get("researcher").userId ?? (await ensureUser(db, c.get("researcher").email)).id;

  async function meResponse(c: Context<Env>): Promise<MeResponse> {
    const researcher = c.get("researcher");
    const id = await userId(c);
    const request = await one<{ at: Date }>(db, "SELECT at FROM researcher_requests WHERE user_id = $1 AND decided_at IS NULL", [id]);
    return {
      email: researcher.email,
      role: researcher.accountRole,
      limits: await effectiveLimits(db, id),
      usage: await usage(db, id),
      researcherRequest: request ? { at: request.at } : null,
      canRequestResearcher: (await getSettings(db)).registration.requests,
      mfaRequired: server.requireMfa && !researcher.mfa,
    };
  }

  app.get("/me", requireResearcher(server, { withoutMfa: true }), async (c) => c.json(await meResponse(c)));

  app.post("/me/researcher-request", signedIn, async (c) => {
    const parsed = ResearcherRequestWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    if (c.get("researcher").accountRole !== "user") throw new HttpError(409, "You are a researcher already");
    if (!(await getSettings(db)).registration.requests) throw new HttpError(403, "This server doesn't take requests: ask for an invite link");
    await db.query(
      `INSERT INTO researcher_requests (user_id, message) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET message = excluded.message, at = now(), decided_at = NULL, decided_by = NULL, approved = NULL`,
      [await userId(c), parsed.data.message],
    );
    return c.json(await meResponse(c));
  });

  app.post("/me/researcher-invite", signedIn, async (c) => {
    const parsed = RedeemResearcherInviteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const id = await userId(c);
    const used = await db.transaction(async (tx) => {
      const invite = await one<{ id: number; plan_id: number | null }>(
        tx,
        `UPDATE researcher_invites SET used_by = $2, used_at = now()
         WHERE secret = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires > now() RETURNING id, plan_id`,
        [parsed.data.secret, id],
      );
      if (!invite) return false;
      // Admins stay admins; the invite's plan only if they have none of their own.
      await tx.query(
        `UPDATE users SET role = CASE WHEN role = 'admin' THEN role ELSE 'researcher' END, plan_id = COALESCE(plan_id, $2) WHERE id = $1`,
        [id, invite.plan_id],
      );
      return true;
    });
    if (!used) throw new HttpError(404, "This invite link is unknown, used or expired", "invite_invalid");
    if (c.get("researcher").accountRole === "user") c.get("researcher").accountRole = "researcher";
    return c.json(await meResponse(c));
  });

  app.get("/me/keys", signedIn, async (c) => c.json(await listApiKeys(db, await userId(c))));

  app.post("/me/keys", signedIn, async (c) => {
    const parsed = ApiKeyWriteSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(await createApiKey(db, await userId(c), parsed.data.label), 201);
  });

  app.post("/me/keys/:id/revoke", signedIn, async (c) => {
    const key = await revokeApiKey(db, await userId(c), Number(c.req.param("id")));
    if (!key) return c.json({ error: "API key not found" }, 404);
    return c.json(key);
  });

  return app;
}
