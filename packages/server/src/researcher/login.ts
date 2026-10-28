import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import type { LoginError } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { one } from "../db.js";
import type { LoginState } from "../oidc.js";
import { applyRegistration, ensureUser } from "../shared/accounts.js";
import { createSession, deleteSession, SESSION_TTL_MS } from "../shared/sessions.js";
import { CLIENT_HEADER } from "../runtime/session.js";

// Researcher login (oidc.ts): `/auth/login` sends the browser to the
// provider, `/auth/callback` takes it back and starts our own session: an
// httpOnly cookie for the whole origin. The client is served from this
// server's origin (in development, Vite proxies to it).

export const SESSION_COOKIE = "annotinder_session";
const LOGIN_COOKIE = "annotinder_login";
const LOGIN_TTL_S = 10 * 60;

/** Only paths on this origin: no open redirects. */
function safeReturnTo(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function parseLoginState(raw: string | false | undefined): LoginState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginState;
  } catch {
    return null;
  }
}

const secure = (c: Context) => new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";

export function login(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  const { oidc, publicUrl } = server.login ?? {};
  const redirectUri = publicUrl ? `${publicUrl}/auth/callback` : "";

  app.get("/auth/options", (c) => c.json({ login: !!oidc, devAuth: server.devAuth }));

  app.get("/auth/login", async (c) => {
    if (!oidc) return c.json({ error: "Login is not configured on this server" }, 404);
    const { url, state } = await oidc.start(redirectUri, safeReturnTo(c.req.query("returnTo")));
    await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(state), server.secret, {
      path: "/auth",
      httpOnly: true,
      sameSite: "Lax", // sent along when the provider redirects back
      secure: secure(c),
      maxAge: LOGIN_TTL_S,
    });
    return c.redirect(url.href);
  });

  app.get("/auth/callback", async (c) => {
    if (!oidc) return c.json({ error: "Login is not configured on this server" }, 404);
    const raw = await getSignedCookie(c, server.secret, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: "/auth" });
    const state = parseLoginState(raw);
    const back = (path: string, error?: LoginError) => {
      const url = new URL(path, publicUrl);
      if (error) url.searchParams.set("loginError", error);
      return c.redirect(url.pathname + url.search + url.hash);
    };
    // No (valid) login cookie: expired, or not started here.
    if (!state) return back("/", "login_failed");

    // The URL as the provider redirected to it (behind a proxy, ours differs).
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(c.req.url).search;
    const result = await oidc.finish(callbackUrl, state);
    if ("error" in result) return back(state.returnTo, result.error);

    const user = await applyRegistration(server.db, await ensureUser(server.db, result.email), server.admins);
    if (await one(server.db, "SELECT 1 FROM users WHERE id = $1 AND blocked_at IS NOT NULL", [user.id])) return back(state.returnTo, "blocked");
    setCookie(c, SESSION_COOKIE, await createSession(server.db, user.id, result.mfa), {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: secure(c),
      maxAge: SESSION_TTL_MS / 1000,
    });
    return back(state.returnTo);
  });

  app.post("/auth/logout", async (c) => {
    if (c.req.header(CLIENT_HEADER) !== "1") return c.json({ error: `Missing ${CLIENT_HEADER} header` }, 403);
    const key = getCookie(c, SESSION_COOKIE);
    if (key) await deleteSession(server.db, key);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  return app;
}
