import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import type { MfaClaim } from "../oidc.js";
import { emptyDb } from "./testDb.js";
import { CLIENT_ID, CLIENT_SECRET, ISSUER, mockIssuer } from "./mockIssuer.js";

// Researcher login against a mock OpenID Connect provider: the test plays
// the browser, following the redirects and keeping cookies.

const PUBLIC_URL = "http://annotinder.test";

let db: Sql;
let issuer: ReturnType<typeof mockIssuer>;
let app: ReturnType<typeof createApp>;

function newApp(admins: string[] = [], mfaClaim?: MfaClaim) {
  return createApp(db, {
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
    await db.query("INSERT INTO roles (role, email_domain) VALUES ('researcher', 'uni.nl')");
    const b = browser();
    expect(await b.logIn(verified)).toBe("/studies?x=1");
    expect(b.cookies.has("annotinder_session")).toBe(true);
    expect(await (await b.api("/api/me")).json()).toMatchObject({ email: "jane@uni.nl", role: "researcher" });

    // Their studies: the same user as an API key for the same address.
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "Mine" }) })).status).toBe(201);
    expect(((await (await b.api("/api/study")).json()) as unknown[]).length).toBe(1);

    // A second login with the same identity (another device) is the same user
    const device = browser();
    await device.logIn(verified);
    expect(((await (await device.api("/api/study")).json()) as unknown[]).length).toBe(1);
    // Another identity with the same email address is not: the identity is iss + sub, never the email
    const other = browser();
    await other.logIn({ ...verified, sub: "other-sub" });
    expect(((await (await other.api("/api/study")).json()) as unknown[]).length).toBe(0);
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
    expect(b.cookies.has("annotinder_session")).toBe(false);
  });

  it("always requires the provider's second factor for researcher access (OIDC_MFA_CLAIM, default amr:mfa)", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    // Logged in, but without a second factor: only GET /me (and coding)
    expect(await b.logIn({ ...verified, amr: ["pwd"] })).toBe("/studies?x=1");
    expect(await (await b.api("/api/me")).json()).toMatchObject({
      role: "admin",
      twoFactor: { required: true, freshUntil: null },
    });
    const study = await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) });
    expect(study.status).toBe(403);
    expect(await study.json()).toMatchObject({ code: "mfa_required" });
    expect((await b.api("/api/me/keys")).status).toBe(403);
    // Another amr value than the configured one doesn't count
    await b.logIn({ ...verified, amr: ["pwd", "otp"] });
    expect(await (await b.api("/api/me")).json()).toMatchObject({ twoFactor: { required: true } });

    expect(await b.logIn(verified)).toBe("/studies?x=1");
    expect(await (await b.api("/api/me")).json()).toMatchObject({ twoFactor: { required: false } });
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);

    // An acr value instead (e.g. SURFconext's assurance level)
    app = newApp(["jane@uni.nl"], { claim: "acr", value: "loa2" });
    const c = browser();
    await c.logIn(verified);
    expect(await (await c.api("/api/me")).json()).toMatchObject({ twoFactor: { required: true } });
    await c.logIn({ ...verified, amr: ["pwd"], acr: "loa2" });
    expect(await (await c.api("/api/me")).json()).toMatchObject({ twoFactor: { required: false } });
  });

  it("asks for a recent second factor for sensitive actions (step-up with max_age, auth_time checked here)", async () => {
    app = newApp(["jane@uni.nl"]);
    const b = browser();
    // Logged in with a second factor, but 20 minutes ago: normal work goes on, an API key needs a new login
    await b.logIn({ ...verified, auth_time: secondsAgo(20 * 60) });
    expect(await (await b.api("/api/me")).json()).toMatchObject({ twoFactor: { required: false, freshUntil: null } });
    expect((await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
    const key = await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) });
    expect(key.status).toBe(403);
    expect(await key.json()).toMatchObject({ code: "step_up_required" });

    // The step-up login asks the provider for a login of at most AUTH_STEP_UP_MAX_AGE seconds
    const start = await b.request("/api/auth/login?returnTo=/x&stepUp=1");
    expect(new URL(start.headers.get("location")!).searchParams.get("max_age")).toBe("600");
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
    expect(new Date(me.twoFactor.freshUntil).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect((await b.api("/api/me/keys", { method: "POST", body: JSON.stringify({ label: "R" }) })).status).toBe(201);
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
      await asKey(`/api/study/${study.id}/coders/delete`, { method: "POST", body: JSON.stringify({ coderIds: [1] }) }),
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
    // Server admin role
    const bob = (await (
      await asKey("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: "bob@uni.nl", role: "researcher" }),
      })
    ).json()) as { id: number };
    await refused(
      await asKey(`/api/admin/users/${bob.id}`, { method: "PUT", body: JSON.stringify({ role: "admin" }) }),
    );
    await refused(
      await asKey("/api/admin/users", { method: "POST", body: JSON.stringify({ email: "eve@uni.nl", role: "admin" }) }),
    );
    expect(
      (await asKey(`/api/admin/users/${bob.id}`, { method: "PUT", body: JSON.stringify({ role: "user" }) })).status,
    ).toBe(200);
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
    await db.query("INSERT INTO roles (role, email_domain) VALUES ('researcher', '*.uni.nl')");
    expect(await role("jane@dept.uni.nl")).toBe("researcher");
    expect(await role("jane@uni.nl.evil.com")).toBe("user");
    await db.query("INSERT INTO roles (role) VALUES ('researcher')");
    expect(await role("anyone@gmail.com")).toBe("researcher");

    // A user can't create studies
    await db.query("DELETE FROM roles WHERE user_id IS NULL AND email_domain IS NULL");
    const b = browser();
    await b.logIn({ ...verified, email: "student@gmail.com", sub: "student" });
    const res = await b.api("/api/study", { method: "POST", body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "researcher_required" });
  });

  it("refuses blocked users, and ends their sessions", async () => {
    const b = browser();
    await b.logIn(verified);
    await db.query("UPDATE users SET blocked_at = now()");
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
  });

  it("logs out: the session no longer works", async () => {
    const b = browser();
    await b.logIn(verified);
    const session = b.cookies.get("annotinder_session")!;
    expect((await b.request("/api/auth/logout", { method: "POST" })).status).toBe(403); // CSRF header
    expect((await b.api("/api/auth/logout", { method: "POST" })).status).toBe(204);
    expect(b.cookies.has("annotinder_session")).toBe(false);
    // The old cookie, replayed: gone on the server too.
    const res = await app.request("/api/me", {
      headers: { cookie: `annotinder_session=${session}`, "x-annotinder": "1" },
    });
    expect(res.status).toBe(401);
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
    expect(await db.query("SELECT iss, sub FROM identities i JOIN users u ON u.id = i.user_id ORDER BY iss")).toEqual([
      { iss: ISSUER, sub: "new-jane" },
      { iss: OLD, sub: "old-jane" },
    ]);
    expect(await db.query("SELECT count(*)::int AS n FROM users")).toEqual([{ n: 1 }]);
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
