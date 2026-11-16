import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import type { LoginError } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { one } from "../db.js";
import type { LoginState } from "../oidc.js";
import { loginUser } from "../shared/accounts.js";
import { createSession, deleteSession, SESSION_TTL_MS, userForSession } from "../shared/sessions.js";
import { securityLog } from "../shared/securityLog.js";
import { CLIENT_HEADER } from "../runtime/session.js";

// Researcher login (oidc.ts): `/api/auth/login` sends the browser to the
// provider, `/api/auth/callback` takes it back and starts our own session: an
// httpOnly cookie for the whole origin. The client is served from this
// server's origin (in development, Vite proxies to it). `?stepUp=1`: a login
// for a sensitive action: the provider must authenticate the user again
// unless it did so within `AUTH_STEP_UP_MAX_AGE` (`max_age`), and the server
// checks the ID token's `auth_time` and second factor itself, because
// providers don't always do what was asked.
//
// Moving to another provider (docs/accounts.md "Changing providers"): with
// `OIDC_PREVIOUS_*` set, `?provider=previous` logs in with the old one until
// `OIDC_PREVIOUS_UNTIL`, and `?link=1` (logged in) adds the current
// provider's identity to the logged-in user (account linking).

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

const secure = (c: Context) =>
  new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";

/** Clock difference with the provider we allow when checking `auth_time`. */
const CLOCK_SKEW_MS = 60_000;

/** Whether a login's second factor is recent enough for sensitive actions (step-up). */
export function isFresh(
  login: { mfa: boolean; authTime: Date | null },
  maxAgeSeconds: number,
  now = Date.now(),
): boolean {
  return login.mfa && login.authTime !== null && now - login.authTime.getTime() <= maxAgeSeconds * 1000 + CLOCK_SKEW_MS;
}

export function login(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  const { oidc, publicUrl, previous } = server.login ?? {};
  /** The previous provider, while it is still accepted. */
  const previousOidc = () => (previous && Date.now() < previous.until.getTime() ? previous.oidc : null);
  const redirectUri = publicUrl ? `${publicUrl}/api/auth/callback` : "";

  app.get("/auth/options", (c) =>
    c.json({
      login: !!oidc,
      devMode: server.devMode,
      previous: previousOidc() && previous ? { until: previous.until } : null,
    }),
  );

  app.get("/auth/login", async (c) => {
    if (!oidc) return c.json({ error: "Login is not configured on this server" }, 404);
    const stepUp = c.req.query("stepUp") === "1";
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    // Linking: the current provider's login is added to the logged-in user
    let linkUserId: number | undefined;
    if (c.req.query("link") === "1") {
      const key = getCookie(c, SESSION_COOKIE);
      const user = key ? await userForSession(server.db, key) : null;
      if (!user) return c.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}loginError=link_failed`);
      linkUserId = user.id;
    }
    const usePrevious = c.req.query("provider") === "previous" && !linkUserId;
    const provider = usePrevious ? previousOidc() : oidc;
    if (!provider) return c.json({ error: "The previous login provider is no longer accepted" }, 404);
    const { url, state } = await provider.start(
      redirectUri,
      {
        returnTo,
        provider: usePrevious ? "previous" : "current",
        ...(stepUp ? { stepUp } : {}),
        ...(linkUserId ? { linkUserId } : {}),
      },
      stepUp ? server.stepUpMaxAge : undefined,
    );
    await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(state), server.secret, {
      path: "/api/auth",
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
    deleteCookie(c, LOGIN_COOKIE, { path: "/api/auth" });
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
    const provider = state.provider === "previous" ? previousOidc() : oidc;
    if (!provider) return back(state.returnTo, "login_failed");
    const result = await provider.finish(callbackUrl, state);
    if ("error" in result) return back(state.returnTo, result.error);

    if (state.linkUserId !== undefined) {
      // Account linking: this identity joins the user who was logged in (not if it is someone else's already)
      const owner = await one<{ user_id: number }>(
        server.db,
        "SELECT user_id FROM identities WHERE iss = $1 AND sub = $2",
        [result.iss, result.sub],
      );
      if (owner && owner.user_id !== state.linkUserId) return back(state.returnTo, "link_failed");
      if (!owner)
        await server.db.query("INSERT INTO identities (iss, sub, user_id) VALUES ($1, $2, $3)", [
          result.iss,
          result.sub,
          state.linkUserId,
        ]);
      await securityLog(server.db, state.linkUserId, "identity_linked", { issuer: result.iss });
    }
    const user = await loginUser(server.db, result, server.admins);
    if (await one(server.db, "SELECT 1 FROM users WHERE id = $1 AND blocked_at IS NOT NULL", [user.id]))
      return back(state.returnTo, "blocked");
    const login = { mfa: result.mfa, authTime: result.authTime, issuer: result.iss };
    await securityLog(server.db, user.id, "login", {
      issuer: result.iss,
      mfa: result.mfa,
      ...(state.stepUp ? { stepUp: true } : {}),
    });
    setCookie(c, SESSION_COOKIE, await createSession(server.db, user.id, login), {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: secure(c),
      maxAge: SESSION_TTL_MS / 1000,
    });
    // A step-up login must bring a recent second factor (checked here, whatever the provider did with max_age)
    if (state.stepUp && !isFresh(login, server.stepUpMaxAge)) return back(state.returnTo, "step_up_failed");
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
