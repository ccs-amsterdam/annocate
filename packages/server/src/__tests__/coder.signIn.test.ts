import { beforeEach, describe, expect, it } from "vitest";
import type { Limits, SessionResponse } from "@annotinder/contracts";
import { ensureUser, getSettings } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";
import { SESSION_COOKIE } from "../researcher/login.js";
import { query } from "./testDb.js";
import {
  CODER_LOGIN,
  addCoders,
  coder,
  codersInvite,
  createSet,
  crowd,
  db,
  devices,
  ownedBy,
  redeploy,
  restart,
  restartWithLogin,
  send,
  sentiment,
  useServer,
} from "./coderHarness.js";

// Optional sign-in (docs/coder-identity.md §5): a coder who doesn't have to
// sign in chooses to, to continue on other devices. Expert coders always
// may; a crowd's coders only where the study's owner's plan has it on
// (`crowdSignIn`, docs/accounts.md §3), which is off unless set.

const LINK = "demo-secret";
type Session = SessionResponse & { code?: string };

/** A device's session on the study's link; `signIn`: the coder chose to sign in (`x-use-login`). */
async function session(device: string, { signIn = false, params = "" } = {}) {
  const headers: Record<string, string> = { "x-link-secret": LINK };
  if (signIn) headers["x-use-login"] = "1";
  if (params) headers["x-url-params"] = params;
  const res = await send(device, "/session", {}, headers);
  return { status: res.status, body: (await res.json()) as Session };
}

/** Logs a device's browser in as this address. */
async function logIn(device: string, email: string) {
  const user = await ensureUser(db, email);
  const cookie = await createSession(db, user.id, CODER_LOGIN);
  if (!devices.has(device)) devices.set(device, { cookies: new Map(), linkSecret: null });
  devices.get(device)!.cookies.set(SESSION_COOKIE, cookie);
}

const emails = async () =>
  (await query<{ email: string | null }>(db, "SELECT email FROM coder_sessions ORDER BY id")).map((s) => s.email);

beforeEach(() => useServer(restartWithLogin()));

describe("a crowd's coders, where the owner's plan doesn't let them sign in", () => {
  it("aren't offered to sign in: also in a study without an owner, or whose owner has no plan", async () => {
    expect((await session("nobody's")).body).toMatchObject({ canLogIn: false, signIn: "none" });
    await ownedBy("owner@example.org");
    expect((await session("no plan")).body).toMatchObject({ canLogIn: false, signIn: "none" });
  });

  it("the server ignores their choice to sign in: the login isn't linked, and finds no session elsewhere", async () => {
    await ownedBy("owner@example.org");
    const before = await session("phone");
    await logIn("phone", "c@example.org");
    const after = await session("phone", { signIn: true });
    expect(after.body).toMatchObject({ sessionId: before.body.sessionId, login: null, canLogIn: false });
    // Another device with the same login: its own session
    await logIn("laptop", "c@example.org");
    const laptop = await session("laptop", { signIn: true });
    expect(laptop.body.sessionId).not.toBe(before.body.sessionId);
    expect(await emails()).toEqual([null, null]);
  });

  it("a coder id that started elsewhere isn't offered to log in here", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "pid" } })]);
    expect((await session("first", { params: "pid=P1" })).status).toBe(200);
    const elsewhere = await session("second", { params: "pid=P1" });
    expect(elsewhere).toMatchObject({ status: 409, body: { code: "coder_has_session", canLogIn: false } });
  });
});

describe("a crowd's coders, where the owner's plan lets them sign in", () => {
  it("are offered to sign in, until their session has an email", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    const before = await session("phone");
    expect(before.body).toMatchObject({ login: null, canLogIn: true, signIn: "optional" });
    await logIn("phone", "c@example.org");
    // A login in the browser alone doesn't count: the coder chooses
    expect((await session("phone")).body).toMatchObject({ login: null, canLogIn: true });
    const after = await session("phone", { signIn: true });
    expect(after.body).toMatchObject({
      sessionId: before.body.sessionId,
      login: "c@example.org",
      canLogIn: false,
      signIn: "optional",
    });
  });

  it("a device that joined by a transfer link has no link: signing in is possible, linking the session isn't", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    await session("phone");
    const { token } = (await (
      await send("phone", "/transfer", { method: "POST" }, { "x-link-secret": LINK })
    ).json()) as {
      token: string;
    };
    expect((await send("laptop", "/transfer/redeem", { method: "POST", body: JSON.stringify({ token }) })).status).toBe(
      200,
    );
    const joined = (await (await send("laptop", "/session")).json()) as Session;
    expect(joined).toMatchObject({ signIn: "optional", canLogIn: false });
  });

  it("a coder id that started elsewhere is offered to log in here", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    await redeploy({}, [crowd(undefined, { coderParam: { param: "pid" } })]);
    await session("first", { params: "pid=P1" });
    const elsewhere = await session("second", { params: "pid=P1" });
    expect(elsewhere).toMatchObject({ status: 409, body: { code: "coder_has_session", canLogIn: true } });
  });

  it("not on a server without a login", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    useServer(restart());
    expect((await session("phone")).body).toMatchObject({ canLogIn: false, signIn: "none" });
  });

  describe("the owner's limits: their plan, else their email domain's, else the default plan; their own on top", () => {
    const plan = async (name: string, limits: Limits) =>
      (
        await query<{ id: number }>(db, "INSERT INTO plans (name, limits) VALUES ($1, $2) RETURNING id", [name, limits])
      )[0]!.id;
    let n = 0;
    const offered = async () => (await session(`device ${++n}`)).body.canLogIn;

    it("the owner's own plan", async () => {
      const owner = await ownedBy("owner@uni.nl");
      expect(await offered()).toBe(false);
      await query(db, "UPDATE users SET plan_id = $1 WHERE id = $2", [
        await plan("Panels", { crowdSignIn: true }),
        owner,
      ]);
      expect(await offered()).toBe(true);
    });

    it("a plan of the owner's email domain: on in any of them", async () => {
      await ownedBy("owner@dept.uni.nl");
      const off = await plan("Off", { crowdSignIn: false });
      await query(db, "INSERT INTO domain_plans (domain, plan_id) VALUES ('dept.uni.nl', $1)", [off]);
      expect(await offered()).toBe(false);
      const on = await plan("On", { crowdSignIn: true });
      await query(db, "INSERT INTO domain_plans (domain, plan_id) VALUES ('*.uni.nl', $1)", [on]);
      expect(await offered()).toBe(true);
    });

    it("the default plan, and the owner's own setting over any plan", async () => {
      const owner = await ownedBy("owner@example.org");
      const standard = await plan("Default", { crowdSignIn: true });
      await getSettings(db);
      await query(db, "UPDATE server_settings SET default_plan_id = $1", [standard]);
      expect(await offered()).toBe(true);
      await query(db, `UPDATE users SET limits = '{"crowdSignIn": false}' WHERE id = $1`, [owner]);
      expect(await offered()).toBe(false);
    });

    it("another researcher's plan doesn't count: the study's owner's does", async () => {
      await ownedBy("owner@example.org");
      const other = await ensureUser(db, "colleague@example.org");
      await query(db, `UPDATE users SET limits = '{"crowdSignIn": true}' WHERE id = $1`, [other.id]);
      await query(db, "INSERT INTO roles (role, study_id, user_id) VALUES ('ADMIN', 1, $1)", [other.id]);
      expect(await offered()).toBe(false);
    });
  });
});

describe("expert coders", () => {
  beforeEach(async () => {
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }]);
    await createSet("anna", ["unit-1"], "coder_set");
  });
  const annaLink = async () =>
    (
      await query<{ secret: string }>(
        db,
        "SELECT secret FROM links WHERE retired_at IS NULL AND params->>'coder' = 'anna'",
      )
    )[0]!.secret;
  const onLink = async (device: string, secret: string, signIn = false) => {
    const headers = { "x-link-secret": secret, ...(signIn ? { "x-use-login": "1" } : {}) };
    return (await (await send(device, "/session", {}, headers)).json()) as Session;
  };

  it("may always sign in, whatever the owner's plan says", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: false });
    await redeploy({}, [codersInvite("per_coder")]);
    const secret = await annaLink();
    const before = await onLink("laptop", secret);
    expect(before).toMatchObject({ login: null, canLogIn: true, signIn: "optional" });
    await logIn("laptop", "private@example.org");
    expect(await onLink("laptop", secret, true)).toMatchObject({
      sessionId: before.sessionId,
      login: "private@example.org",
      canLogIn: false,
    });
    // On another device their link says they started elsewhere, and offers to log in
    const elsewhere = await send("phone", "/session", {}, { "x-link-secret": secret });
    expect(await elsewhere.json()).toMatchObject({ code: "coder_has_session", canLogIn: true });
  });

  it("who must sign in: the session says so, and has nothing more to offer", async () => {
    await redeploy({}, [codersInvite("login")]);
    await logIn("laptop", "anna@uni.nl");
    expect((await session("laptop")).body).toMatchObject({ login: "anna@uni.nl", canLogIn: false, signIn: "required" });
  });

  it("on a server without a login: no signing in", async () => {
    await redeploy({}, [codersInvite("per_coder")]);
    useServer(restart());
    expect(await onLink("laptop", await annaLink())).toMatchObject({ canLogIn: false, signIn: "none" });
  });
});

describe("a coder whose login ends while coding", () => {
  beforeEach(async () => {
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }]);
    await createSet("anna", ["unit-1"], "coder_set");
  });

  it("goes on coding on the device: its session is linked to the email, and no longer needs the login", async () => {
    await redeploy({}, [codersInvite("login")]);
    await logIn("laptop", "anna@uni.nl");
    const laptop = coder("laptop", LINK);
    const started = await laptop.session();
    expect(started.login).toBe("anna@uni.nl");
    // Past AUTH_SESSION_IDLE and AUTH_SESSION_MAX
    await query(db, "UPDATE sessions SET last_active = now() - interval '2 days', created = now() - interval '2 days'");
    expect(await laptop.session()).toMatchObject({ sessionId: started.sessionId, login: "anna@uni.nl" });
    const unit = await laptop.next();
    expect((await laptop.submit(unit!.id, sentiment("positive"))).status).toBe(200);
  });
});
