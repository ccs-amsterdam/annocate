import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import type { MfaClaim } from "../oidc.js";
import { createSession, DEFAULT_LOGIN_LIMITS, sweepExpiredSessions, type LoginLimits } from "../shared/sessions.js";
import { emptyDb, query } from "./testDb.js";
import { CLIENT_ID, CLIENT_SECRET, ISSUER, mockIssuer } from "./mockIssuer.js";

// Researcher login against a mock OpenID Connect provider: the test plays
// the browser, following the redirects and keeping cookies.

const PUBLIC_URL = "http://annotinder.test";

let db: Db;
let issuer: ReturnType<typeof mockIssuer>;
let app: ReturnType<typeof createApp>;

function newApp(
  admins: string[] = [],
  mfaClaim?: MfaClaim,
  insecure?: { disable2fa?: boolean; disableEmailVerification?: boolean },
  loginLimits?: Partial<LoginLimits>,
) {
  return createApp(db, {
    ...(insecure ? { insecure } : {}),
    ...(loginLimits ? { loginLimits } : {}),
    secret: "test-secret",
    login: {
      oidc: {
        issuer: ISSUER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        fetch: issuer.fetch,
        ...(mfaClaim ? { mfaClaim } : {}),
      },
      publicUrl: PUBLIC_URL,
      accountUrl: `${ISSUER}/account`,
    },
    admins,
  });
}

beforeEach(async () => {
  db = await emptyDb();
  issuer = mockIssuer();
  app = newApp();
});

/** A browser: its cookies, sent with every request. */
function browser() {
  const cookies = new Map<string, string>();
  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookies.size) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await app.request(path, { ...init, headers });
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(";");
      const at = pair.indexOf("=");
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(set)) cookies.delete(pair.slice(0, at));
      else cookies.set(pair.slice(0, at), value);
    }
    return res;
  };
  return {
    cookies,
    request,
    /** Researcher API calls as the client makes them. */
    api: (path: string, init: RequestInit = {}) =>
      request(path, { ...init, headers: { "content-type": "application/json", "x-annotinder": "1", ...init.headers } }),
    /** Logs in with these ID token claims; returns where the server sends the browser at the end. */
    async logIn(claims: Record<string, unknown>, returnTo = "/studies?x=1", stepUp = false) {
      const start = await request(
        `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}${stepUp ? "&stepUp=1" : ""}`,
      );
      expect(start.status).toBe(302);
      const { code, state } = issuer.approve(start.headers.get("location")!, claims);
      const done = await request(`/api/auth/callback?code=${code}&state=${state}`);
      expect(done.status).toBe(302);
      return done.headers.get("location")!;
    },
  };
}

/** A login with a verified email and a second factor, just now (the provider's `auth_time`). */
const verified = { email: "Jane@Uni.nl", email_verified: true, amr: ["pwd", "mfa"] };
const secondsAgo = (s: number) => Math.floor(Date.now() / 1000) - s;
/** Sets a time of every session to this many minutes ago. */
const ago = (column: "created" | "last_active" | "auth_time" | "step_up_at", minutes: number) =>
  query(db, `UPDATE sessions SET ${column} = now() - make_interval(mins => $1)`, [minutes]);

describe("researcher login", () => {
  it("tells the client login is available", async () => {
    expect(await (await app.request("/api/auth/options")).json()).toEqual({
      login: true,
      devMode: false,
      previous: null,
    });
    expect(await (await createApp(db).request("/api/auth/options")).json()).toEqual({
      login: false,
      devMode: false,
      previous: null,
    });
  });

  it("sends the browser to the provider with PKCE, state and nonce", async () => {
    const res = await browser().request("/api/auth/login");
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("redirect_uri")).toBe(`${PUBLIC_URL}/api/auth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email");
    for (const p of ["state", "nonce", "code_challenge"]) expect(url.searchParams.get(p)).toBeTruthy();
  });

  it("starts a session for the verified email, and returns to the page the researcher came from", async () => {
    await query(db, "INSERT INTO roles (role, email_domain) VALUES ('researcher', 'uni.nl')");
    const b = browser();
    expect(await b.logIn(verified)).toBe("/studies?x=1");
    expect(b.cookies.has("annotinder_session")).toBe(true);
    expect(await (await b.api("/api/me")).json()).toMatchObject({ email: "jane@uni.nl", role: "researcher" });

    // Their studies: the same user as an API key for the same address.
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "Mine" }) })).status).toBe(201);
    expect(((await (await b.api("/api/study")).json()) as { studies: unknown[] }).studies.length).toBe(1);

    // A second login with the same identity (another device) is the same user
    const device = browser();
    await device.logIn(verified);
    expect(((await (await device.api("/api/study")).json()) as { studies: unknown[] }).studies.length).toBe(1);
    // Another identity with the same email address is not: the identity is iss + sub, never the email
    const other = browser();
    await other.logIn({ ...verified, sub: "other-sub" });
    expect(((await (await other.api("/api/study")).json()) as { studies: unknown[] }).studies.length).toBe(0);
  });

  it("needs the CSRF header with the session cookie", async () => {
    const b = browser();
    await b.logIn(verified);
    expect((await b.request("/api/me")).status).toBe(401);
    expect((await b.request("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(401);
  });

  it("refuses unverified email addresses", async () => {
    const b = browser();
    expect(await b.logIn({ email: "jane@uni.nl", email_verified: false })).toBe(
      "/studies?x=1&loginError=email_unverified",
    );
    expect(await b.logIn({ email: "jane@uni.nl" })).toBe("/studies?x=1&loginError=email_unverified");
    expect(await b.logIn({ email_verified: true })).toBe("/studies?x=1&loginError=email_missing");
    expect(b.cookies.has("annotinder_session")).toBe(false);
  });

  it("AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION: unverified addresses log in and claim invitations, but get no domain or verified-email roles", async () => {
    app = newApp(["boss@uni.nl"], undefined, { disableEmailVerification: true });
    await query(db, "INSERT INTO roles (role, email_domain) VALUES ('researcher', 'uni.nl')");
    await query(db, "INSERT INTO users (email) VALUES ('ann@other.nl')");
    const b = browser();
    expect(await b.logIn({ email: "jane@uni.nl", email_verified: false, amr: ["mfa"] })).toBe("/studies?x=1");
    // Logged in, but the domain role needs a verified address
    expect(await (await b.api("/api/me")).json()).toMatchObject({ email: "jane@uni.nl", role: "user" });
    // Once the provider confirms it, the domain role applies
    await b.logIn(verified);
    expect(await (await b.api("/api/me")).json()).toMatchObject({ role: "researcher" });
    expect((await query(db, "SELECT email_verified FROM users WHERE email = 'jane@uni.nl'"))[0]).toEqual({
      email_verified: true,
    });

    // An invitation (a role given to an address) is claimed without verification: the admins are warned
    await query(
      db,
      "INSERT INTO roles (role, user_id) SELECT 'researcher', id FROM users WHERE email = 'ann@other.nl'",
    );
    const ann = browser();
    await ann.logIn({ email: "ann@other.nl", sub: "ann", amr: ["mfa"] });
    expect(await (await ann.api("/api/me")).json()).toMatchObject({ role: "researcher" });
    const boss = browser();
    await boss.logIn({ ...verified, email: "boss@uni.nl", sub: "boss" });
    const warnings = ((await (await boss.api("/api/admin/warnings")).json()) as { code: string }[]).map((w) => w.code);
    expect(warnings).toEqual(expect.arrayContaining(["email_verification_not_required", "unverified_roles"]));
    expect(warnings).not.toContain("2fa_not_required");

    // An address named in ANNOTINDER_ADMINS is an admin only once the provider confirms it
    const claimed = browser();
    await claimed.logIn({ email: "boss@uni.nl", sub: "not-the-boss", email_verified: false, amr: ["mfa"] });
    expect(await (await claimed.api("/api/me")).json()).toMatchObject({ email: "boss@uni.nl", role: "user" });

    // Turned off again: unverified addresses can't log in
    app = newApp(["boss@uni.nl"]);
    expect(await browser().logIn({ email: "ann@other.nl", sub: "ann", amr: ["mfa"] })).toBe(
      "/studies?x=1&loginError=email_unverified",
    );
  });

  it("AUTH_INSECURE_DISABLE_2FA: no second factor needed, but sensitive actions still need a recent login", async () => {
    app = newApp(["jane@uni.nl"], undefined, { disable2fa: true });
    const b = browser();
    await b.logIn({ ...verified, amr: ["pwd"], auth_time: secondsAgo(20 * 60) });
    expect(await (await b.api("/api/me")).json()).toMatchObject({
      twoFactor: { enabled: false, used: false, freshUntil: null },
    });
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
    const key = await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) });
    expect(key.status).toBe(403);
    expect(await key.json()).toMatchObject({ code: "step_up_required" });
    // Step-up: a recent login is enough, without a second factor; an old one still fails
    expect(await b.logIn({ ...verified, amr: ["pwd"], auth_time: secondsAgo(30 * 60) }, "/x", true)).toBe(
      "/x?loginError=step_up_failed",
    );
    expect(await b.logIn({ ...verified, amr: ["pwd"], auth_time: secondsAgo(5) }, "/x", true)).toBe("/x");
    expect((await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })).status).toBe(201);
    // Whether logins use 2FA is still recorded
    expect((await query(db, "SELECT has_mfa FROM users WHERE email = 'jane@uni.nl'"))[0]).toEqual({ has_mfa: false });
    const warnings = ((await (await b.api("/api/admin/warnings")).json()) as { code: string }[]).map((w) => w.code);
    expect(warnings).toContain("2fa_not_required");
    expect(warnings).not.toContain("no_2fa_signal");
  });

  it("researchers work without a second factor; server admin access needs one (OIDC_MFA_CLAIM, default amr:mfa)", async () => {
    await query(db, "INSERT INTO roles (role, email_domain) VALUES ('researcher', 'uni.nl')");
    app = newApp(["boss@uni.nl"]);
    // A researcher without a second factor: works, and is told where to set one up
    const b = browser();
    expect(await b.logIn({ ...verified, amr: ["pwd"] })).toBe("/studies?x=1");
    expect(await (await b.api("/api/me")).json()).toMatchObject({
      role: "researcher",
      twoFactor: { enabled: true, used: false, setupUrl: `${ISSUER}/account`, adminOff: false, freshUntil: null },
    });
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
    // ... but sensitive actions need a login with one
    expect(
      await (await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })).json(),
    ).toMatchObject({
      code: "step_up_required",
    });

    // A server admin without a second factor works as a researcher; admin pages say why not
    const admin = browser();
    await admin.logIn({ ...verified, email: "boss@uni.nl", sub: "boss", amr: ["pwd"] });
    expect(await (await admin.api("/api/me")).json()).toMatchObject({
      role: "researcher",
      twoFactor: { used: false, adminOff: true },
    });
    const users = await admin.api("/api/admin/users");
    expect(users.status).toBe(403);
    expect(await users.json()).toMatchObject({ code: "mfa_required" });
    // Another amr value than the configured one doesn't count
    await admin.logIn({ ...verified, email: "boss@uni.nl", sub: "boss", amr: ["pwd", "otp"] });
    expect((await admin.api("/api/admin/users")).status).toBe(403);
    // With one: admin
    await admin.logIn({ ...verified, email: "boss@uni.nl", sub: "boss" });
    expect(await (await admin.api("/api/me")).json()).toMatchObject({
      role: "admin",
      twoFactor: { used: true, adminOff: false },
    });
    expect((await admin.api("/api/admin/users")).ok).toBe(true);

    // An acr value instead (e.g. SURFconext's assurance level)
    app = newApp(["boss@uni.nl"], { claim: "acr", value: "loa2" });
    const c = browser();
    await c.logIn({ ...verified, email: "boss@uni.nl", sub: "boss" });
    expect(await (await c.api("/api/me")).json()).toMatchObject({ role: "researcher", twoFactor: { adminOff: true } });
    await c.logIn({ ...verified, email: "boss@uni.nl", sub: "boss", amr: ["pwd"], acr: "loa2" });
    expect(await (await c.api("/api/me")).json()).toMatchObject({ role: "admin" });
  });

  it("asks for a new login with a second factor for sensitive actions (step-up, auth_time checked here)", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    // Logged in with a second factor, but 20 minutes ago (AUTH_STEP_UP_IDLE: 15): normal work goes on, an API key needs a new login
    await b.logIn({ ...verified, auth_time: secondsAgo(20 * 60) });
    expect(await (await b.api("/api/me")).json()).toMatchObject({ twoFactor: { used: true, freshUntil: null } });
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
    const key = await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) });
    expect(key.status).toBe(403);
    expect(await key.json()).toMatchObject({ code: "step_up_required" });

    // The step-up login asks the provider for a new login, whatever session the browser has there
    const start = new URL((await b.request("/api/auth/login?returnTo=/x&stepUp=1")).headers.get("location")!);
    expect([start.searchParams.get("max_age"), start.searchParams.get("prompt")]).toEqual(["0", "login"]);
    // A provider that ignores max_age (an old auth_time) or a login without the second factor: refused here
    expect(await b.logIn({ ...verified, auth_time: secondsAgo(30 * 60) }, "/x", true)).toBe(
      "/x?loginError=step_up_failed",
    );
    expect(await b.logIn({ ...verified, amr: ["pwd"], auth_time: secondsAgo(5) }, "/x", true)).toBe(
      "/x?loginError=step_up_failed",
    );
    expect(await b.logIn({ ...verified, auth_time: secondsAgo(5) }, "/x", true)).toBe("/x");
    expect((await b.api("/api/me")).ok).toBe(true);
    const me = (await (await b.api("/api/me")).json()) as { twoFactor: { freshUntil: string } };
    expect(new Date(me.twoFactor.freshUntil).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect((await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })).status).toBe(201);
  });

  it("asks the provider for a new login after a second factor was set up (its session still holds the old login)", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    const prompt = async (query: string) =>
      new URL((await b.request(`/api/auth/login?returnTo=/x${query}`)).headers.get("location")!).searchParams.get(
        "prompt",
      );
    // Logged in without a second factor: "log in again" (fresh=1) needs a new login there
    await b.logIn({ ...verified, amr: ["pwd"], auth_time: secondsAgo(5) });
    expect(await prompt("&fresh=1")).toBe("login");
    expect(await prompt("")).toBeNull();
  });

  it("API keys never do sensitive actions: no new keys, no deleting answers or studies, no admin roles", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    await b.logIn({ ...verified, auth_time: secondsAgo(5) });
    const { key } = (await (
      await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })
    ).json()) as { key: string };
    const asKey = (path: string, init: RequestInit = {}) =>
      app.request(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${key}` } });
    const study = (await (
      await asKey("/api/study", { method: "POST", body: JSON.stringify({ name: "Keyed" }) })
    ).json()) as { id: number };
    expect(study.id).toBeGreaterThan(0);
    const refused = async (res: Response) => {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "not_with_api_key" });
    };
    await refused(await asKey("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "another" }) }));
    await refused(await asKey("/api/me/keys/1/revoke", { method: "POST" }));
    await refused(
      await asKey(`/api/study/${study.id}/annotations/reset`, { method: "POST", body: JSON.stringify({}) }),
    );
    await refused(
      await asKey(`/api/study/${study.id}/coders/delete`, {
        method: "POST",
        body: JSON.stringify({ sessionIds: [1] }),
      }),
    );
    await refused(await asKey(`/api/study/${study.id}`, { method: "DELETE" }));
    // Study roles: READ and WRITE can be given; the study's ADMINs can't be changed
    const users = (list: { email: string; role: string }[]) =>
      asKey(`/api/study/${study.id}/users`, { method: "PUT", body: JSON.stringify({ users: list }) });
    expect(
      (
        await users([
          { email: "jane@uni.nl", role: "ADMIN" },
          { email: "bob@uni.nl", role: "WRITE" },
        ])
      ).status,
    ).toBe(204);
    await refused(
      await users([
        { email: "jane@uni.nl", role: "ADMIN" },
        { email: "bob@uni.nl", role: "ADMIN" },
      ]),
    );
    // The admin API: a key is a researcher at most, also this admin's
    const adminApi = await asKey("/api/admin/users");
    expect(adminApi.status).toBe(403);
    expect(await adminApi.json()).toMatchObject({ code: "admin_required" });
  });

  it("makes users, researchers (open registration, domains) and admins (named by the server)", async () => {
    const role = async (email: string) => {
      const b = browser();
      await b.logIn({ ...verified, email, sub: email });
      return ((await (await b.api("/api/me")).json()) as { role: string }).role;
    };
    app = newApp(["boss@uni.nl"]);
    expect(await role("anyone@gmail.com")).toBe("user");
    expect(await role("boss@uni.nl")).toBe("admin");
    await query(db, "INSERT INTO roles (role, email_domain) VALUES ('researcher', '*.uni.nl')");
    expect(await role("jane@dept.uni.nl")).toBe("researcher");
    expect(await role("jane@uni.nl.evil.com")).toBe("user");
    await query(db, "INSERT INTO roles (role) VALUES ('researcher')");
    expect(await role("anyone@gmail.com")).toBe("researcher");

    // A user can't create studies
    await query(db, "DELETE FROM roles WHERE user_id IS NULL AND email_domain IS NULL");
    const b = browser();
    await b.logIn({ ...verified, email: "student@gmail.com", sub: "student" });
    const res = await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "researcher_required" });
  });

  it("refuses blocked users, and ends their sessions", async () => {
    const b = browser();
    await b.logIn(verified);
    await query(db, "UPDATE users SET blocked_at = now()");
    expect((await b.api("/api/me")).status).toBe(401);
    expect(await b.logIn(verified)).toContain("loginError=blocked");
  });

  it("refuses callbacks it didn't start, replayed codes and foreign return addresses", async () => {
    const b = browser();
    // No login started: no login cookie.
    expect((await b.request("/api/auth/callback?code=x&state=y")).headers.get("location")).toBe(
      "/?loginError=login_failed",
    );

    // A state that doesn't match the login cookie.
    const start = await b.request("/api/auth/login");
    const { code } = issuer.approve(start.headers.get("location")!, verified);
    expect((await b.request(`/api/auth/callback?code=${code}&state=forged`)).headers.get("location")).toContain(
      "loginError=login_failed",
    );

    // Return addresses stay on this origin.
    expect(await browser().logIn(verified, "https://evil.example/")).toBe("/");
    expect(await browser().logIn(verified, "//evil.example/")).toBe("/");
    // A tab, which browsers drop from a URL: `/\t/evil.example` would be `//evil.example`
    expect(await browser().logIn(verified, "/\t/evil.example")).toBe("/");
    expect(
      (
        await browser().request(`/api/auth/login?link=1&returnTo=${encodeURIComponent("/\t/evil.example")}`)
      ).headers.get("location"),
    ).toBe("/?loginError=link_failed");
  });

  it("gives the cookie as long as a session can last, once: the server ends the session sooner", async () => {
    const b = browser();
    const start = await b.request("/api/auth/login?returnTo=/");
    const { code, state } = issuer.approve(start.headers.get("location")!, verified);
    const done = await b.request(`/api/auth/callback?code=${code}&state=${state}`);
    const cookie = done.headers.getSetCookie().find((c) => c.startsWith("annotinder_session="));
    expect(cookie).toContain(`Max-Age=${DEFAULT_LOGIN_LIMITS.sessionMax}`);
    expect(cookie).toContain("HttpOnly");
    await ago("last_active", 10);
    for (const res of [await b.api("/api/me"), await b.api("/api/auth/activity", { method: "POST" })])
      expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("ends a session after AUTH_SESSION_IDLE without activity, and AUTH_SESSION_MAX after the login", async () => {
    const b = browser();
    await b.logIn(verified);
    await ago("last_active", 29);
    expect((await b.api("/api/me")).status).toBe(200);
    await ago("last_active", 31);
    expect((await b.api("/api/me")).status).toBe(401);
    // However active, a day after the login
    await b.logIn(verified);
    await ago("created", 23 * 60);
    expect((await b.api("/api/me")).status).toBe(200);
    await ago("created", 24 * 60 + 1);
    expect((await b.api("/api/me")).status).toBe(401);
    // Other limits
    app = newApp([], undefined, undefined, { sessionIdle: 3600, sessionMax: 7200 });
    await ago("created", 60);
    await ago("last_active", 59);
    expect((await b.api("/api/me")).status).toBe(200);
    await ago("created", 121);
    expect((await b.api("/api/me")).status).toBe(401);
  });

  it("counts changes and reported activity as activity, not reading (the client refreshes pages), written once a minute", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    await b.logIn(verified);
    const lastActive = async () =>
      (
        await query<{ minutes: number }>(
          db,
          "SELECT round(extract(epoch FROM now() - last_active) / 60)::int AS minutes FROM sessions",
        )
      )[0]!.minutes;
    await ago("last_active", 20);
    expect((await b.api("/api/me")).status).toBe(200);
    expect(await lastActive()).toBe(20);
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
    expect(await lastActive()).toBe(0);
    // Not written again within the minute
    await query(db, "UPDATE sessions SET last_active = now() - interval '30 seconds'");
    const written = await query(db, "SELECT last_active FROM sessions");
    await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "y" }) });
    expect(await query(db, "SELECT last_active FROM sessions")).toEqual(written);
    // The client reports activity: the user types or clicks without making requests
    await ago("last_active", 20);
    expect((await b.api("/api/auth/activity", { method: "POST" })).status).toBe(204);
    expect(await lastActive()).toBe(0);
  });

  it("takes reported activity only from a live session, with the client header", async () => {
    const b = browser();
    expect((await b.api("/api/auth/activity", { method: "POST" })).status).toBe(401);
    await b.logIn(verified);
    expect((await b.request("/api/auth/activity", { method: "POST" })).status).toBe(403);
    await ago("last_active", 31);
    expect((await b.api("/api/auth/activity", { method: "POST" })).status).toBe(401);
  });

  it("allows sensitive actions for AUTH_STEP_UP_IDLE after the login or the last one, up to AUTH_STEP_UP_MAX_AGE after the login", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    await b.logIn({ ...verified, auth_time: secondsAgo(5) });
    const newKey = async () =>
      (await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })).status;
    const freshUntil = async () =>
      ((await (await b.api("/api/me")).json()) as { twoFactor: { freshUntil: string | null } }).twoFactor.freshUntil;
    const minutesLeft = async () => Math.round((new Date((await freshUntil())!).getTime() - Date.now()) / 60_000);
    // 10 minutes after the login: allowed, and the next one may come 15 minutes from now
    await ago("auth_time", 10);
    expect(await newKey()).toBe(201);
    expect(await minutesLeft()).toBe(15);
    // 50 minutes after the login, 10 after the last sensitive action: allowed, renewed
    await ago("auth_time", 50);
    await ago("step_up_at", 10);
    expect(await newKey()).toBe(201);
    expect(await minutesLeft()).toBe(11); // the login's hour ends first (plus a minute for the provider's clock)
    // 16 minutes after the last one: a new login
    await ago("step_up_at", 16);
    expect(await freshUntil()).toBeNull();
    expect(await newKey()).toBe(403);
    // Over an hour after the login, however recent the last one
    await ago("auth_time", 62);
    await ago("step_up_at", 1);
    expect(await newKey()).toBe(403);
    // A step-up login starts over
    expect(await b.logIn({ ...verified, auth_time: secondsAgo(5) }, "/x", true)).toBe("/x");
    expect(await newKey()).toBe(201);
  });

  it("a new login ends the session it replaces, and removes expired sessions", async () => {
    const b = browser();
    await b.logIn(verified);
    const first = b.cookies.get("annotinder_session")!;
    await query(
      db,
      "INSERT INTO sessions (user_id, key_hash, last_active) VALUES (1, 'old', now() - interval '1 hour')",
    );
    await b.logIn(verified);
    expect(b.cookies.get("annotinder_session")).not.toBe(first);
    expect((await b.api("/api/me")).status).toBe(200);
    const withFirst = { cookie: `annotinder_session=${first}`, "x-annotinder": "1" };
    expect((await app.request("/api/me", { headers: withFirst })).status).toBe(401);
    expect(await query(db, "SELECT count(*)::int AS n FROM sessions")).toEqual([{ n: 1 }]);
  });

  it("sweeps expired sessions on its own, until stopped", async () => {
    const b = browser();
    await b.logIn(verified);
    const expire = () =>
      query(db, "INSERT INTO sessions (user_id, key_hash, created) VALUES (1, 'old', now() - interval '2 days')");
    const left = async () => (await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM sessions"))[0]!.n;
    await expire();
    const stop = sweepExpiredSessions(db, DEFAULT_LOGIN_LIMITS, 10);
    await vi.waitFor(async () => expect(await left()).toBe(1));
    stop();
    // A sweep that started before stop() may still be running: let it finish first
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expire();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await left()).toBe(2);
  });

  it("logs out: the session no longer works", async () => {
    const b = browser();
    await b.logIn(verified);
    const session = b.cookies.get("annotinder_session")!;
    expect((await b.request("/api/auth/logout", { method: "POST" })).status).toBe(403); // CSRF header
    expect((await b.api("/api/auth/logout", { method: "POST" })).status).toBe(200);
    expect(b.cookies.has("annotinder_session")).toBe(false);
    // The old cookie, replayed: gone on the server too.
    const res = await app.request("/api/me", {
      headers: { cookie: `annotinder_session=${session}`, "x-annotinder": "1" },
    });
    expect(res.status).toBe(401);
  });
});

const storedTokens = () => query<{ id_token: string | null }>(db, "SELECT id_token FROM sessions");
const logOut = async (b: ReturnType<typeof browser>) =>
  (await (await b.api("/api/auth/logout", { method: "POST" })).json()) as { redirect: string | null };

describe("logout at the login provider (RP-Initiated Logout)", () => {
  it("keeps the login's ID token with the session, and never sends it to the client", async () => {
    const b = browser();
    await b.logIn(verified);
    const [stored] = await storedTokens();
    const payload = JSON.parse(Buffer.from(stored!.id_token!.split(".")[1]!, "base64url").toString());
    expect(payload).toMatchObject({ iss: ISSUER, sub: "user-1" });
    expect(await (await b.api("/api/me")).text()).not.toContain(stored!.id_token!);
  });

  it("ends the session here, then sends the browser to the provider's end_session_endpoint", async () => {
    const b = browser();
    await b.logIn(verified);
    const idToken = (await storedTokens())[0]!.id_token!;
    const { redirect } = await logOut(b);
    const url = new URL(redirect!);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/logout`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id_token_hint: idToken,
      client_id: CLIENT_ID,
      post_logout_redirect_uri: `${PUBLIC_URL}/`,
    });
    expect(await storedTokens()).toEqual([]);
  });

  it("logs out here only without an end_session_endpoint, an ID token, a session or a provider", async () => {
    issuer = mockIssuer(ISSUER, { endSession: false });
    app = newApp();
    const b = browser();
    await b.logIn(verified);
    expect(await logOut(b)).toEqual({ redirect: null });
    expect(await storedTokens()).toEqual([]);

    issuer = mockIssuer();
    app = newApp();
    const [user] = await query<{ id: number }>(db, "SELECT id FROM users");
    const key = await createSession(db, user!.id, { mfa: true, authTime: new Date(), issuer: ISSUER });
    const noToken = browser();
    noToken.cookies.set("annotinder_session", key);
    expect(await logOut(noToken)).toEqual({ redirect: null });
    expect(await logOut(browser())).toEqual({ redirect: null });
    // Development mode, no provider
    const dev = await createApp(db).request("/api/auth/logout", { method: "POST", headers: { "x-annotinder": "1" } });
    expect(await dev.json()).toEqual({ redirect: null });
  });

  it("logs out here only when the provider can't be reached", async () => {
    const OLD = "https://old-idp.test";
    const down = (() => Promise.reject(new Error("provider down"))) as typeof fetch;
    app = createApp(db, {
      secret: "test-secret",
      login: {
        oidc: { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: issuer.fetch },
        publicUrl: PUBLIC_URL,
        previous: {
          oidc: { issuer: OLD, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: down },
          until: new Date(Date.now() + 86_400_000),
        },
      },
    });
    const [user] = await query<{ id: number }>(db, "INSERT INTO users (email) VALUES ('jane@uni.nl') RETURNING id");
    const login = { mfa: true, authTime: new Date(), issuer: OLD };
    const b = browser();
    b.cookies.set("annotinder_session", await createSession(db, user!.id, login, "t"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await logOut(b)).toEqual({ redirect: null });
    expect(warn).toHaveBeenCalledWith("Logout at the login provider skipped:", expect.anything());
    warn.mockRestore();
    expect(await storedTokens()).toEqual([]);
  });
});

describe("changing providers (OIDC_PREVIOUS_*)", () => {
  const OLD = "https://old-idp.test";
  let old: ReturnType<typeof mockIssuer>;
  beforeEach(() => {
    old = mockIssuer(OLD);
    app = createApp(db, {
      secret: "test-secret",
      login: {
        oidc: { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: issuer.fetch },
        publicUrl: PUBLIC_URL,
        previous: {
          oidc: { issuer: OLD, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: old.fetch },
          until: new Date(Date.now() + 86_400_000),
        },
      },
      admins: ["jane@uni.nl"],
    });
  });

  async function logInAt(
    b: ReturnType<typeof browser>,
    query: string,
    idp: ReturnType<typeof mockIssuer>,
    claims: Record<string, unknown>,
  ) {
    const start = await b.request(`/api/auth/login?returnTo=/&${query}`);
    expect(start.status).toBe(302);
    const { code, state } = idp.approve(start.headers.get("location")!, claims);
    return (await b.request(`/api/auth/callback?code=${code}&state=${state}`)).headers.get("location")!;
  }
  const me = async (b: ReturnType<typeof browser>) =>
    (await (await b.api("/api/me")).json()) as { email: string; linkNeeded: boolean };

  it("logs in with the previous provider until it ends, and links the new provider's login to the same account", async () => {
    expect(await (await app.request("/api/auth/options")).json()).toMatchObject({
      previous: { until: expect.any(String) },
    });
    const b = browser();
    expect(await logInAt(b, "provider=previous", old, { ...verified, sub: "old-jane" })).toBe("/");
    expect(await me(b)).toMatchObject({ email: "jane@uni.nl", linkNeeded: true });
    const warning = async () =>
      ((await (await b.api("/api/admin/warnings")).json()) as { code: string; message: string }[]).find(
        (w) => w.code === "migration_not_finished",
      )?.message;
    expect(await warning()).toContain("1 user hasn't linked");
    // Linking: a login at the new provider, with another email address even, joins this account
    expect(await logInAt(b, "link=1", issuer, { ...verified, email: "jane@new.org", sub: "new-jane" })).toBe("/");
    expect(await me(b)).toMatchObject({ email: "jane@new.org", linkNeeded: false });
    expect(await warning()).toContain("0 users haven't linked");
    // From now on the new provider's login is this account
    const later = browser();
    await later.logIn({ ...verified, email: "jane@new.org", sub: "new-jane" });
    expect((await me(later)).email).toBe("jane@new.org");
    expect(await query(db, "SELECT iss, sub FROM identities i JOIN users u ON u.id = i.user_id ORDER BY iss")).toEqual([
      { iss: ISSUER, sub: "new-jane" },
      { iss: OLD, sub: "old-jane" },
    ]);
    expect(await query(db, "SELECT count(*)::int AS n FROM users")).toEqual([{ n: 1 }]);
  });

  it("links only during a move, from a login at the previous provider, and one login per provider", async () => {
    const linkStart = async (b: ReturnType<typeof browser>) =>
      (await b.request("/api/auth/login?returnTo=/&link=1")).headers.get("location");
    // Logged in at the current provider: nothing to link (a second login there would be someone else's)
    const current = browser();
    await current.logIn(verified);
    expect(await linkStart(current)).toBe("/?loginError=link_failed");

    // Linked already: no second identity at the current provider
    const b = browser();
    await logInAt(b, "provider=previous", old, { ...verified, email: "ann@uni.nl", sub: "old-ann" });
    expect(await logInAt(b, "link=1", issuer, { ...verified, email: "ann@uni.nl", sub: "new-ann" })).toBe("/");
    await logInAt(b, "provider=previous", old, { ...verified, email: "ann@uni.nl", sub: "old-ann" });
    expect(await linkStart(b)).toBe("/?loginError=link_failed");
    expect(await query(db, "SELECT sub FROM identities WHERE iss = $1 ORDER BY sub", [ISSUER])).toEqual([
      { sub: "new-ann" },
      { sub: "user-1" },
    ]);

    // No move going on: no linking, whoever is logged in
    app = newApp();
    const later = browser();
    await later.logIn(verified);
    expect(await linkStart(later)).toBe("/?loginError=link_failed");
  });

  it("linking needs a recent login: a stale session steps up at the previous provider first", async () => {
    const b = browser();
    await logInAt(b, "provider=previous", old, { ...verified, sub: "old-jane", auth_time: secondsAgo(20 * 60) });
    // Not to the new provider yet: whoever holds this session must show they are its user
    const start = await b.request("/api/auth/login?returnTo=/account&link=1");
    const stepUp = new URL(start.headers.get("location")!);
    expect(stepUp.origin).toBe(OLD);
    expect(stepUp.searchParams.get("max_age")).toBe("0");
    // A provider that didn't ask again: no linking
    const stale = old.approve(stepUp.href, { ...verified, sub: "old-jane", auth_time: secondsAgo(20 * 60) });
    expect(
      (await b.request(`/api/auth/callback?code=${stale.code}&state=${stale.state}`)).headers.get("location"),
    ).toBe("/account?loginError=step_up_failed");
    expect(await query(db, "SELECT sub FROM identities WHERE iss = $1", [ISSUER])).toEqual([]);

    // With a fresh login the server goes on to the new provider, which must authenticate whoever is there
    const again = await b.request("/api/auth/login?returnTo=/account&link=1");
    const fresh = old.approve(again.headers.get("location")!, { ...verified, sub: "old-jane" });
    const on = (await b.request(`/api/auth/callback?code=${fresh.code}&state=${fresh.state}`)).headers.get("location")!;
    expect(on).toBe("/api/auth/login?link=1&returnTo=%2Faccount");
    const link = new URL((await b.request(on)).headers.get("location")!);
    expect(link.origin).toBe(ISSUER);
    expect(link.searchParams.get("prompt")).toBe("login");
    const linked = issuer.approve(link.href, { ...verified, sub: "new-jane" });
    expect(
      (await b.request(`/api/auth/callback?code=${linked.code}&state=${linked.state}`)).headers.get("location"),
    ).toBe("/account");
    expect(await query(db, "SELECT sub FROM identities WHERE iss = $1", [ISSUER])).toEqual([{ sub: "new-jane" }]);
  });

  it("logs out at the provider the session's login came from", async () => {
    const b = browser();
    await logInAt(b, "provider=previous", old, { ...verified, sub: "old-jane" });
    const { redirect } = await logOut(b);
    expect(new URL(redirect!).origin + new URL(redirect!).pathname).toBe(`${OLD}/logout`);
    await b.logIn(verified);
    expect(new URL((await logOut(b)).redirect!).origin).toBe(ISSUER);
  });

  it("doesn't link a login that is someone else's account, nor without a session", async () => {
    await browser().logIn({ ...verified, email: "other@uni.nl", sub: "taken" });
    const b = browser();
    await logInAt(b, "provider=previous", old, { ...verified, sub: "old-jane" });
    expect(await logInAt(b, "link=1", issuer, { ...verified, sub: "taken" })).toBe("/?loginError=link_failed");
    expect((await browser().request("/api/auth/login?returnTo=/&link=1")).headers.get("location")).toBe(
      "/?loginError=link_failed",
    );
  });
});
