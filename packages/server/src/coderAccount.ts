import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, Server } from "./context.js";
import { HttpError } from "./shared/http.js";
import { userForSession } from "./shared/sessions.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { requireClientHeader } from "./runtime/session.js";
import { coderStudies } from "./shared/coderStudies.js";
import { eq, sql } from "drizzle-orm";
import { UserSettingsSchema } from "@annotinder/contracts";
import { coderSessions, users } from "./db/schema/index.js";

/**
 * Coder routes outside a deployment (`/api/coder`, contracts
 * `coderAccountEndpoints`): a logged-in coder's studies on any device, the
 * sessions their login's email is linked to (docs/coder-identity.md §5).
 */
export function coderAccount(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/coder/sessions", async (c) => {
    requireClientHeader(c);
    const cookie = getCookie(c, SESSION_COOKIE);
    const user = cookie ? await userForSession(server.db, cookie) : null;
    if (!user) throw new HttpError(401, "Log in to see your studies on other devices", "auth_required");
    return c.json(await coderStudies(server.db, sql`lower(${coderSessions.email}) = lower(${user.email})`));
  });
  // The logged-in person's own settings (theme, keys): on every device
  const loggedIn = async (c: Context<Env>) => {
    requireClientHeader(c);
    const cookie = getCookie(c, SESSION_COOKIE);
    const user = cookie ? await userForSession(server.db, cookie) : null;
    if (!user) throw new HttpError(401, "Log in to keep your settings on every device", "auth_required");
    return user;
  };
  app.get("/coder/settings", async (c) => {
    const user = await loggedIn(c);
    const [row] = await server.db.select({ settings: users.settings }).from(users).where(eq(users.id, user.id));
    return c.json(row?.settings ?? {});
  });
  app.put("/coder/settings", async (c) => {
    const user = await loggedIn(c);
    const parsed = UserSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    await server.db.update(users).set({ settings: parsed.data }).where(eq(users.id, user.id));
    return c.json(parsed.data);
  });
  return app;
}
