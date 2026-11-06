import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, Server } from "./context.js";
import { HttpError } from "./shared/http.js";
import { userForSession } from "./shared/sessions.js";
import { SESSION_COOKIE } from "./researcher/login.js";
import { requireClientHeader } from "./runtime/session.js";
import { coderStudies } from "./shared/coderStudies.js";

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
    return c.json(await coderStudies(server.db, "lower(c.email) = lower($1)", [user.email]));
  });
  return app;
}
