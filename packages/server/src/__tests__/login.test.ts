import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { emptyDb } from "./testDb.js";
import { CLIENT_ID, CLIENT_SECRET, ISSUER, mockIssuer } from "./mockIssuer.js";

// Researcher login against a mock OpenID Connect provider: the test plays
// the browser, following the redirects and keeping cookies.

const PUBLIC_URL = "http://annotinder.test";

let db: Sql;
let issuer: ReturnType<typeof mockIssuer>;
let app: ReturnType<typeof createApp>;

function newApp(requireMfa = false, admins: string[] = []) {
  return createApp(db, {
    secret: "test-secret",
    login: {
      oidc: { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: issuer.fetch },
      publicUrl: PUBLIC_URL,
    },
    requireMfa,
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
    async logIn(claims: Record<string, unknown>, returnTo = "/jobs?x=1") {
      const start = await request(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      expect(start.status).toBe(302);
      const { code, state } = issuer.approve(start.headers.get("location")!, claims);
      const done = await request(`/auth/callback?code=${code}&state=${state}`);
      expect(done.status).toBe(302);
      return done.headers.get("location")!;
    },
  };
}

const verified = { email: "Jane@Uni.nl", email_verified: true };

describe("researcher login", () => {
  it("tells the client login is available", async () => {
    expect(await (await app.request("/auth/options")).json()).toEqual({ login: true, devAuth: false });
    expect(await (await createApp(db).request("/auth/options")).json()).toEqual({ login: false, devAuth: false });
  });

  it("sends the browser to the provider with PKCE, state and nonce", async () => {
    const res = await browser().request("/auth/login");
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("redirect_uri")).toBe(`${PUBLIC_URL}/auth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email");
    for (const p of ["state", "nonce", "code_challenge"]) expect(url.searchParams.get(p)).toBeTruthy();
  });

  it("starts a session for the verified email, and returns to the page the researcher came from", async () => {
    await db.query("INSERT INTO domain_rules (domain, researcher) VALUES ('uni.nl', true)");
    const b = browser();
    expect(await b.logIn(verified)).toBe("/jobs?x=1");
    expect(b.cookies.has("annotinder_session")).toBe(true);
    expect(await (await b.api("/me")).json()).toMatchObject({ email: "jane@uni.nl", role: "researcher" });

    // Their jobs: the same user as an API key for the same address.
    expect((await b.api("/job", { method: "POST", body: JSON.stringify({ name: "Mine" }) })).status).toBe(201);
    expect(((await (await b.api("/job")).json()) as unknown[]).length).toBe(1);

    // A second login (another device, another login method) is the same user.
    const other = browser();
    await other.logIn({ email: "jane@uni.nl", email_verified: true, sub: "other-sub" });
    expect(((await (await other.api("/job")).json()) as unknown[]).length).toBe(1);
  });

  it("needs the CSRF header with the session cookie", async () => {
    const b = browser();
    await b.logIn(verified);
    expect((await b.request("/me")).status).toBe(401);
    expect((await b.request("/job", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(401);
  });

  it("refuses unverified email addresses", async () => {
    const b = browser();
    expect(await b.logIn({ email: "jane@uni.nl", email_verified: false })).toBe("/jobs?x=1&loginError=email_unverified");
    expect(await b.logIn({ email: "jane@uni.nl" })).toBe("/jobs?x=1&loginError=email_unverified");
    expect(b.cookies.has("annotinder_session")).toBe(false);
  });

  it("requires a second factor for researcher access only when the server says so", async () => {
    app = newApp(true, ["jane@uni.nl"]);
    const b = browser();
    // Logged in, but without a second factor: only GET /me (and coding)
    expect(await b.logIn({ ...verified, amr: ["pwd"] })).toBe("/jobs?x=1");
    expect(await (await b.api("/me")).json()).toMatchObject({ role: "admin", mfaRequired: true });
    const job = await b.api("/job", { method: "POST", body: JSON.stringify({ name: "x" }) });
    expect(job.status).toBe(403);
    expect(await job.json()).toMatchObject({ code: "mfa_required" });
    expect((await b.api("/me/keys")).status).toBe(403);

    expect(await b.logIn({ ...verified, amr: ["pwd", "otp"] })).toBe("/jobs?x=1");
    expect(await (await b.api("/me")).json()).toMatchObject({ mfaRequired: false });
    expect((await b.api("/job", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(201);
  });

  it("makes users, researchers (open registration, domains) and admins (named by the server)", async () => {
    const role = async (email: string) => {
      const b = browser();
      await b.logIn({ ...verified, email });
      return ((await (await b.api("/me")).json()) as { role: string }).role;
    };
    app = newApp(false, ["boss@uni.nl"]);
    expect(await role("anyone@gmail.com")).toBe("user");
    expect(await role("boss@uni.nl")).toBe("admin");
    await db.query("INSERT INTO domain_rules (domain, researcher) VALUES ('*.uni.nl', true)");
    expect(await role("jane@dept.uni.nl")).toBe("researcher");
    expect(await role("jane@uni.nl.evil.com")).toBe("user");
    await db.query(`UPDATE server_settings SET registration = '{"open": true, "requests": true}'`);
    expect(await role("anyone@gmail.com")).toBe("researcher");

    // A user can't create jobs
    await db.query(`UPDATE server_settings SET registration = '{"open": false, "requests": true}'`);
    const b = browser();
    await b.logIn({ ...verified, email: "student@gmail.com" });
    const res = await b.api("/job", { method: "POST", body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "researcher_required" });
  });

  it("refuses blocked users, and ends their sessions", async () => {
    const b = browser();
    await b.logIn(verified);
    await db.query("UPDATE users SET blocked_at = now()");
    expect((await b.api("/me")).status).toBe(401);
    expect(await b.logIn(verified)).toContain("loginError=blocked");
  });

  it("refuses callbacks it didn't start, replayed codes and foreign return addresses", async () => {
    const b = browser();
    // No login started: no login cookie.
    expect((await b.request("/auth/callback?code=x&state=y")).headers.get("location")).toBe("/?loginError=login_failed");

    // A state that doesn't match the login cookie.
    const start = await b.request("/auth/login");
    const { code } = issuer.approve(start.headers.get("location")!, verified);
    expect((await b.request(`/auth/callback?code=${code}&state=forged`)).headers.get("location")).toContain("loginError=login_failed");

    // Return addresses stay on this origin.
    expect(await browser().logIn(verified, "https://evil.example/")).toBe("/");
    expect(await browser().logIn(verified, "//evil.example/")).toBe("/");
  });

  it("logs out: the session no longer works", async () => {
    const b = browser();
    await b.logIn(verified);
    const session = b.cookies.get("annotinder_session")!;
    expect((await b.request("/auth/logout", { method: "POST" })).status).toBe(403); // CSRF header
    expect((await b.api("/auth/logout", { method: "POST" })).status).toBe(204);
    expect(b.cookies.has("annotinder_session")).toBe(false);
    // The old cookie, replayed: gone on the server too.
    const res = await app.request("/me", { headers: { cookie: `annotinder_session=${session}`, "x-annotinder": "1" } });
    expect(res.status).toBe(401);
  });
});
