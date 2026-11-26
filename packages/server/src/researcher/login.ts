import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import type { LoginError } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { identities, users } from "../db/schema/index.js";
import type { LoginState } from "../oidc.js";
import { loginUser } from "../shared/accounts.js";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  SESSION_TTL_MS,
  userForSession,
} from "../shared/sessions.js";
import { isSecure } from "../shared/cookies.js";
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
// `OIDC_PREVIOUS_UNTIL`, and `?link=1` adds the current provider's identity
// to the logged-in user (account linking). Linking decides who can log in
// as this user from now on, so it is a sensitive action: only during the
// move, from a session of the previous provider with a recent login (the
// server asks for one first), for a user without an identity at the current
// provider, and the current provider must authenticate whoever links
// (`prompt=login`).
//
// Logout ends our session and, when the provider publishes an
// `end_session_endpoint`, tells the client to send the browser there (OIDC
// RP-Initiated Logout, with the login's ID token), so the provider's session
// ends too and the next login asks again.

export const SESSION_COOKIE = "annotinder_session";
const LOGIN_COOKIE = "annotinder_login";
const LOGIN_TTL_S = 10 * 60;

/** Characters browsers drop from a URL (tab, newline) or that can't be in one: `/\t/evil.example` would become `//evil.example`. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Only paths on this origin: no open redirects. */
function safeReturnTo(value: string | undefined): string {
  if (!value || CONTROL_CHARACTER.test(value)) return "/";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

/** Issuers are compared without their trailing slashes (providers differ in how they write themselves). */
const sameIssuer = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

function parseLoginState(raw: string | false | undefined): LoginState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginState;
  } catch {
    return null;
  }
}

/**
 * Gives the browser the session's key, for as long as the session lasts: at
 * login, and again whenever the server extends the session.
 */
export function setSessionCookie(c: Context, key: string): void {
  setCookie(c, SESSION_COOKIE, key, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure(c),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Clock difference with the provider we allow when checking `auth_time`. */
const CLOCK_SKEW_MS = 60_000;

/**
 * Whether a login is recent enough for sensitive actions (step-up), with a
 * second factor unless `requireMfa` is false (`AUTH_INSECURE_DISABLE_2FA`:
 * then only `auth_time` counts).
 */
export function isFresh(
  login: { mfa: boolean; authTime: Date | null },
  maxAgeSeconds: number,
  { requireMfa = true, now = Date.now() }: { requireMfa?: boolean; now?: number } = {},
): boolean {
  if (requireMfa && !login.mfa) return false;
  return login.authTime !== null && now - login.authTime.getTime() <= maxAgeSeconds * 1000 + CLOCK_SKEW_MS;
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

  /** Back to a page of the client, with what went wrong for it to show. Only ever a path on this origin. */
  const backTo = (c: Context, path: string, error?: LoginError) => {
    const url = new URL(path, publicUrl);
    if (error) url.searchParams.set("loginError", error);
    return c.redirect(url.pathname + url.search + url.hash);
  };

  /** Whether a user has a login at this provider already. */
  const hasIdentityAt = async (userId: number, issuer: string) =>
    (await server.db.$count(
      identities,
      and(eq(identities.userId, userId), sql`rtrim(${identities.iss}, '/') = ${issuer.replace(/\/+$/, "")}`),
    )) > 0;

  /**
   * Who may link the current provider's login to their account, and whether
   * their login is recent enough to do it now (else: step-up first). Null:
   * linking is refused.
   */
  async function linkingUser(c: Context): Promise<{ id: number; fresh: boolean } | null> {
    const old = previousOidc();
    const key = getCookie(c, SESSION_COOKIE);
    const user = key ? await userForSession(server.db, key) : null;
    // Only while moving providers, and only for someone who logged in with the previous one
    if (!oidc || !old || !user || !sameIssuer(user.issuer, old.issuer)) return null;
    // One identity per provider: a second one would be someone else's login
    if (await hasIdentityAt(user.id, oidc.issuer)) return null;
    return { id: user.id, fresh: isFresh(user, server.stepUpMaxAge, { requireMfa: !server.insecure.disable2fa }) };
  }

  /** Whether the browser's current login lacks a second factor that this server asks for. */
  async function loginWithoutMfa(c: Context): Promise<boolean> {
    if (server.insecure.disable2fa) return false;
    const key = getCookie(c, SESSION_COOKIE);
    const user = key ? await userForSession(server.db, key) : null;
    return user !== null && !user.mfa;
  }

  app.get("/auth/login", async (c) => {
    if (!oidc) return c.json({ error: "Login is not configured on this server" }, 404);
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    const linking = c.req.query("link") === "1" ? await linkingUser(c) : null;
    if (c.req.query("link") === "1" && !linking) return backTo(c, returnTo, "link_failed");
    // Linking with a login that isn't recent: first a step-up login at the previous provider, then back here
    const stepUpToLink = !!linking && !linking.fresh;
    const stepUp = c.req.query("stepUp") === "1" || stepUpToLink;
    const usePrevious = stepUpToLink || (c.req.query("provider") === "previous" && !linking);
    const provider = usePrevious ? previousOidc() : oidc;
    if (!provider) return c.json({ error: "The previous login provider is no longer accepted" }, 404);
    const linkNow = linking && !stepUpToLink;
    const freshLogin = linkNow || c.req.query("fresh") === "1" || (stepUp && (await loginWithoutMfa(c)));
    const { url, state } = await provider.start(
      redirectUri,
      {
        returnTo,
        provider: usePrevious ? "previous" : "current",
        ...(stepUp ? { stepUp } : {}),
        ...(stepUpToLink ? { thenLink: true } : {}),
        ...(linkNow ? { linkUserId: linking.id } : {}),
      },
      // A login at the provider now, whatever session the browser has there: whoever links, and
      // after setting up a second factor (the provider's session still holds the login without one)
      { ...(stepUp ? { maxAge: server.stepUpMaxAge } : {}), ...(freshLogin ? { promptLogin: true } : {}) },
    );
    await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(state), server.secret, {
      path: "/api/auth",
      httpOnly: true,
      sameSite: "Lax", // sent along when the provider redirects back
      secure: isSecure(c),
      maxAge: LOGIN_TTL_S,
    });
    return c.redirect(url.href);
  });

  app.get("/auth/callback", async (c) => {
    if (!oidc) return c.json({ error: "Login is not configured on this server" }, 404);
    const raw = await getSignedCookie(c, server.secret, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: "/api/auth" });
    const state = parseLoginState(raw);
    const back = (path: string, error?: LoginError) => backTo(c, path, error);
    // No (valid) login cookie: expired, or not started here.
    if (!state) return back("/", "login_failed");

    // The URL as the provider redirected to it (behind a proxy, ours differs).
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(c.req.url).search;
    const provider = state.provider === "previous" ? previousOidc() : oidc;
    if (!provider) return back(state.returnTo, "login_failed");
    const result = await provider.finish(callbackUrl, state);
    if ("error" in result) return back(state.returnTo, result.error);
    // An address the provider didn't confirm: refused, unless AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION
    if (!result.emailVerified && !server.insecure.disableEmailVerification)
      return back(state.returnTo, "email_unverified");

    if (state.linkUserId !== undefined) {
      // Account linking: this identity joins the user who was logged in. Not
      // if it is someone's already, nor if the user has a login here (the
      // issuer is the token's now, not the configured one).
      const [owner] = await server.db
        .select({ userId: identities.userId })
        .from(identities)
        .where(and(eq(identities.iss, result.iss), eq(identities.sub, result.sub)));
      if (owner || (await hasIdentityAt(state.linkUserId, result.iss))) return back(state.returnTo, "link_failed");
      await server.db.insert(identities).values({ iss: result.iss, sub: result.sub, userId: state.linkUserId });
      await securityLog(server.db, state.linkUserId, "identity_linked", { issuer: result.iss });
    }
    const user = await loginUser(server.db, result, server.admins);
    if ((await server.db.$count(users, and(eq(users.id, user.id), isNotNull(users.blockedAt)))) > 0)
      return back(state.returnTo, "blocked");
    const login = { mfa: result.mfa, authTime: result.authTime, issuer: result.iss };
    await securityLog(server.db, user.id, "login", {
      issuer: result.iss,
      mfa: result.mfa,
      ...(result.emailVerified ? {} : { emailVerified: false }),
      ...(state.stepUp ? { stepUp: true } : {}),
    });
    // The session this login replaces ends now, not when it expires
    const replaced = getCookie(c, SESSION_COOKIE);
    if (replaced) await deleteSession(server.db, replaced);
    await deleteExpiredSessions(server.db);
    setSessionCookie(c, await createSession(server.db, user.id, login, { idToken: result.idToken, sid: result.sid }));
    // A step-up login must bring a recent second factor (checked here, whatever the provider did with max_age)
    if (state.stepUp && !isFresh(login, server.stepUpMaxAge, { requireMfa: !server.insecure.disable2fa }))
      return back(state.returnTo, "step_up_failed");
    // The step-up was for linking: on to the current provider
    if (state.thenLink) return c.redirect(`/api/auth/login?link=1&returnTo=${encodeURIComponent(state.returnTo)}`);
    return back(state.returnTo);
  });

  /** The provider a session's login came from: the current one or the previous one (whatever its end date). */
  const providerOf = (issuer: string) =>
    [oidc, previous?.oidc].find((provider) => provider && sameIssuer(provider.issuer, issuer)) ?? null;

  /**
   * Where the browser ends an ended session's login at the provider as well
   * (RP-Initiated Logout); null without an ID token, a known provider, or
   * an `end_session_endpoint` there.
   */
  async function providerLogoutUrl(ended: { issuer: string; idToken: string | null } | null): Promise<string | null> {
    const provider = ended?.idToken ? providerOf(ended.issuer) : null;
    if (!provider || !ended?.idToken) return null;
    try {
      return (await provider.endSessionUrl(ended.idToken, `${publicUrl}/`))?.href ?? null;
    } catch (err) {
      console.warn("Logout at the login provider skipped:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  // Ends our session; `redirect`: where the browser ends the provider's too (contracts `LogoutResponse`)
  app.post("/auth/logout", async (c) => {
    if (c.req.header(CLIENT_HEADER) !== "1") return c.json({ error: `Missing ${CLIENT_HEADER} header` }, 403);
    const key = getCookie(c, SESSION_COOKIE);
    const ended = key ? await deleteSession(server.db, key) : null;
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ redirect: await providerLogoutUrl(ended) });
  });

  return app;
}
