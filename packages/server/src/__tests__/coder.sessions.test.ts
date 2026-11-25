import { describe, expect, it } from "vitest";
import type { CoderProgress, CoderUnitResponse, SessionResponse } from "@annotinder/contracts";
import { query } from "./testDb.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { createApp } from "../app.js";
import { DbStore } from "../runtime/dbStore.js";
import { ensureUser } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";

import { SESSION_COOKIE } from "../researcher/login.js";
import {
  adminHeaders,
  db,
  server,
  storeCalls,
  restart,
  devices,
  send,
  coder,
  sentiment,
  demo,
  redeploy,
  listOf,
  crowd,
  useServer,
  forgetStoreCalls,
  CODER_LOGIN,
} from "./coderHarness.js";

describe("quitting and deleting a coder's data", () => {
  it("lets a coder quit and ask for deletion; the researcher deletes later, then now, and the deletion is logged", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const link = { "x-link-secret": "demo-secret", "x-url-params": "participant=P77" };
    const unit = (
      (await (await send("quitter", "/loop/loop_1/next", {}, link)).json()) as { units: CoderUnitResponse[] }
    ).units[0];
    expect(
      (
        await send(
          "quitter",
          "/variables/unit",
          { method: "POST", body: JSON.stringify({ unitId: unit.id, variables: sentiment("positive") }) },
          link,
        )
      ).status,
    ).toBe(200);

    const quit = await send(
      "quitter",
      "/quit",
      { method: "POST", body: JSON.stringify({ requestDeletion: true }) },
      link,
    );
    expect(quit.status).toBe(204);
    const session = (await (await send("quitter", "/session", {}, link)).json()) as SessionResponse;
    expect(session.ended).toMatchObject({ outcome: "quit" });
    expect(session.deletionRequest).toMatchObject({ at: expect.any(String) });
    expect((await send("quitter", "/loop/loop_1/next", {}, link)).status).toBe(409);

    const listed = async () => ((await listOf("coders")) as CoderProgress[]).find((c) => c.coder === "P77");
    const before = (await listed())!;
    expect(before.deletionRequest).toMatchObject({ at: expect.any(String) });
    expect(
      (
        await server.request(`/api/study/1/coders/${before.id}/deletion-request/postpone`, {
          method: "POST",
          headers: adminHeaders,
        })
      ).status,
    ).toBe(204);
    expect((await listed())!.deletionRequest).toMatchObject({ postponedAt: expect.any(String) });

    const del = await server.request("/api/study/1/coders/delete", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ coders: ["P77"] }),
    });
    expect(await del.json()).toEqual({ sessionIds: [before.id], answers: 1 });
    expect(await listed()).toBeUndefined();
    const log = await (await server.request("/api/study/1/coders/deletions", { headers: adminHeaders })).json();
    expect(log).toEqual([
      expect.objectContaining({
        sessionId: before.id,
        coder: "P77",
        requestedAt: expect.any(String),
        deletedAt: expect.any(String),
        answers: 1,
      }),
    ]);
    expect((await query(db, "SELECT 1 FROM annotation_values WHERE session_id = $1", [before.id])).length).toBe(0);
    // Nothing matches: nothing deleted
    const none = await server.request("/api/study/1/coders/delete", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ emails: ["x@y.z"] }),
    });
    expect(await none.json()).toEqual({ sessionIds: [], answers: 0 });
  });
});

describe("coder login", () => {
  /** A device logged in as this email (the researcher login's session cookie). */
  async function loggedIn(device: string, email: string) {
    const user = await ensureUser(db, email);
    devices.set(device, {
      cookies: new Map([["annotinder_session", await createSession(db, user.id, CODER_LOGIN)]]),
      linkSecret: null,
    });
  }
  const session = async (device: string, secret: string | null, headers: Record<string, string> = {}) => {
    const res = await send(device, "/session", {}, { ...(secret ? { "x-link-secret": secret } : {}), ...headers });
    return { status: res.status, body: (await res.json()) as SessionResponse & { code?: string } };
  };
  /** The coder chose to sign in. */
  const SIGN_IN = { "x-use-login": "1" };

  it("an invitation that requires sign-in: the email is linked once; another device finds the session by logging in", async () => {
    await redeploy({}, [crowd(undefined, { login: true })]);
    const secret = "demo-secret";
    expect(await session("anonymous", secret)).toMatchObject({ status: 401, body: { code: "auth_required" } });

    await loggedIn("phone", "a@example.org");
    const phone = await session("phone", secret);
    expect(phone).toMatchObject({ status: 200, body: { login: "a@example.org", canLogIn: false } });
    expect(devices.get("phone")!.cookies.has("annotinder_device")).toBe(true);
    // After that the device cookie alone is the session: logging out doesn't matter
    devices.get("phone")!.cookies.delete("annotinder_session");
    expect((await session("phone", secret)).body.sessionId).toBe(phone.body.sessionId);

    // Another device, without the link: the login finds the session, and the device joins it
    await loggedIn("laptop", "A@example.org");
    expect((await session("laptop", null)).body.sessionId).toBe(phone.body.sessionId);
    devices.get("laptop")!.cookies.delete("annotinder_session");
    expect((await session("laptop", null)).body.sessionId).toBe(phone.body.sessionId);
    // A transfer link works too
    expect((await send("phone", "/transfer", { method: "POST" })).status).toBe(200);

    const coders = (await listOf("coders")) as CoderProgress[];
    expect(coders.find((c) => c.id === phone.body.sessionId)?.email).toBe("a@example.org");
  });

  it("coders may always sign in: links the email to the session started on the device, not shown to researchers", async () => {
    const secret = "demo-secret";
    const before = await session("tablet", secret);
    expect(before.body.login).toBeNull();
    const user = await ensureUser(db, "c@example.org");
    devices.get("tablet")!.cookies.set("annotinder_session", await createSession(db, user.id, CODER_LOGIN));
    const after = await session("tablet", secret, SIGN_IN);
    expect(after.body).toMatchObject({ sessionId: before.body.sessionId, login: "c@example.org" });
    await loggedIn("desktop", "c@example.org");
    expect((await session("desktop", secret, SIGN_IN)).body.sessionId).toBe(before.body.sessionId);

    // One session per email in a study: a device that started its own, then logs in, continues the email's session
    const own = await session("phone", secret);
    expect(own.body.sessionId).not.toBe(before.body.sessionId);
    const phoneUser = await ensureUser(db, "c@example.org");
    devices.get("phone")!.cookies.set("annotinder_session", await createSession(db, phoneUser.id, CODER_LOGIN));
    expect((await session("phone", secret, SIGN_IN)).body.sessionId).toBe(before.body.sessionId);

    // The researcher sees no email where the invitation doesn't require sign-in
    const coders = (await listOf("coders")) as CoderProgress[];
    expect(coders.find((c) => c.id === before.body.sessionId)).toMatchObject({ id: before.body.sessionId });
    expect(coders.find((c) => c.id === before.body.sessionId)!.email).toBeUndefined();
  });
});

describe("a login in the browser that the coder didn't choose to use", () => {
  /** A browser logged in as a researcher. */
  async function researcherBrowser(device: string) {
    const user = await ensureUser(db, "researcher@example.org");
    devices.set(device, {
      cookies: new Map([[SESSION_COOKIE, await createSession(db, user.id, CODER_LOGIN)]]),
      linkSecret: null,
    });
  }
  const emails = async () =>
    (await query<{ email: string | null }>(db, "SELECT email FROM coder_sessions ORDER BY id")).map((s) => s.email);

  it("isn't stored on a session of a link that doesn't require sign-in", async () => {
    await researcherBrowser("office");
    const opened = coder("office");
    const first = await opened.session();
    expect(first.login).toBeNull();
    // Nor on a later request, or on another of their devices: that one has its own session
    expect((await opened.session()).login).toBeNull();
    await researcherBrowser("home");
    expect((await coder("home").session()).sessionId).not.toBe(first.sessionId);
    expect(await emails()).toEqual([null, null]);
  });

  it("doesn't join a second panel link's session to the first", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "PID" } })]);
    await researcherBrowser("shared");
    const open = async (pid: string) =>
      (await (
        await send("shared", "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": `PID=${pid}` })
      ).json()) as SessionResponse;
    const one = await open("p1");
    const two = await open("p2");
    expect(two.sessionId).not.toBe(one.sessionId);
    expect([one.session.coder, two.session.coder]).toEqual(["p1", "p2"]);
    expect((await open("p1")).sessionId).toBe(one.sessionId);
    expect(await emails()).toEqual([null, null]);
  });

  it("is no way to sign in on another study's link", async () => {
    await query(db, "INSERT INTO studies (name, public_id) VALUES ('other', 'bbbbbbbbbbbb')");
    await query(db, "INSERT INTO links (study_id, label, secret, link_key) VALUES (2, 'x', 'other-secret', '[1]')");
    const c = coder("mixed");
    const mine = await c.session();
    await researcherBrowser("mixed-login");
    devices.get("mixed")!.cookies.set(SESSION_COOKIE, devices.get("mixed-login")!.cookies.get(SESSION_COOKIE)!);
    const res = await send("mixed", "/session", {}, { "x-link-secret": "other-secret", "x-use-login": "1" });
    expect(((await res.json()) as SessionResponse).sessionId).toBe(mine.sessionId);
    expect(await emails()).toEqual([null]);
  });
});

describe("sessions across devices", () => {
  it("moves a session to another device with a one-time transfer link", async () => {
    const phone = coder("phone");
    const unit = await phone.next();
    await phone.submit(unit!.id, demo("neutral"));

    const transfer = (await (await phone.call("/transfer", { method: "POST" })).json()) as { token: string };
    // The link carries no secret: the laptop gets the session cookie for that.
    const redeem = () =>
      send("laptop", "/transfer/redeem", { method: "POST", body: JSON.stringify({ token: transfer.token }) });
    const redeemed = await redeem();
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toEqual({});

    const laptop = coder("laptop", null);
    expect((await laptop.session()).progress[0].doneUnitIds).toEqual([unit!.id]);

    const again = await redeem();
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ code: "transfer_invalid" });
  });

  it("never resumes a participant's session from a link alone", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const secret = "demo-secret";
    const link = { "x-link-secret": secret, "x-url-params": "participant=P123" };

    const first = await send("device-1", "/session", {}, link);
    expect(first.status).toBe(200);
    const firstCoder = ((await first.json()) as SessionResponse).sessionId;

    // Same participant link on a new device: explained refusal, not a resumed session.
    const second = await send("device-2", "/session", {}, link);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "coder_has_session" });

    // Confirmed: a new, separate session with the same participant id.
    const confirmed = await send("device-2", "/session", {}, { ...link, "x-new-session": "1" });
    expect(confirmed.status).toBe(200);
    const secondCoder = ((await confirmed.json()) as SessionResponse).sessionId;
    expect(secondCoder).not.toBe(firstCoder);
    const rows = await query(db, "SELECT coder FROM coder_sessions WHERE coder = 'P123'");
    expect(rows).toHaveLength(2);

    // and that device keeps its new session
    const reload = await send("device-2", "/session", {}, link);
    expect(((await reload.json()) as SessionResponse).sessionId).toBe(secondCoder);

    // A revoked link starts no new sessions, also not for a known participant; existing ones go on.
    await query(db, "UPDATE links SET revoked_at = now() WHERE secret = $1", [secret]);
    const refused = await send("device-3", "/session", {}, { ...link, "x-new-session": "1" });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "link_revoked" });
    expect((await send("device-2", "/session", {}, link)).status).toBe(200);
  });

  it("starts one session for a device whose first requests come at once", async () => {
    // Both requests have looked for the device's session (there is none) before either starts one
    let bothLooked!: () => void;
    const looked = new Promise<void>((resolve) => (bothLooked = resolve));
    let waiting = 0;
    const first = () =>
      new DbStore(db, 1).resolveCoder({
        coderKey: "one-browser",
        linkSecret: "demo-secret",
        login: async () => {
          if (++waiting === 2) bothLooked();
          await looked;
          return null;
        },
      });
    const [a, b] = await Promise.all([first(), first()]);
    expect(b.coder.sessionId).toBe(a.coder.sessionId);
    expect(await query(db, "SELECT id FROM coder_sessions")).toHaveLength(1);
    expect(await query(db, "SELECT uses FROM links WHERE secret = 'demo-secret'")).toEqual([{ uses: 1 }]);
  });

  it("gives one coder id at most five sessions, however many are asked for", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const start = (device: string, participant = "P123") =>
      send(
        device,
        "/session",
        {},
        { "x-link-secret": "demo-secret", "x-url-params": `participant=${participant}`, "x-new-session": "1" },
      );
    for (let i = 1; i <= 5; i++) expect((await start(`device-${i}`)).status).toBe(200);
    const sixth = await start("device-6");
    expect(sixth.status).toBe(403);
    expect(await sixth.json()).toMatchObject({ code: "coder_session_limit" });
    // Also not on a device that has one of the five
    expect((await start("device-1")).status).toBe(403);
    expect(await query(db, "SELECT id FROM coder_sessions WHERE coder = 'P123'")).toHaveLength(5);
    // Their sessions go on, and other coders start as before
    expect((await send("device-1", "/session", {}, { "x-url-params": "participant=P123" })).status).toBe(200);
    expect((await start("device-6", "P456")).status).toBe(200);
  });

  it("limits new sessions per address, whatever device cookie is sent; sessions that exist go on", async () => {
    const app = createApp(db, { secret: "test-secret", devMode: true, rateLimits: { newSessions: 3 } });
    const open = (device: string, secret = "demo-secret") =>
      app.request(`/api/d/${DEMO_PUBLIC_ID}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": secret, cookie: `annotinder_device=${device}` },
      });
    for (const device of ["made-up-1", "made-up-2", "made-up-3"]) expect((await open(device)).status).toBe(200);
    const fourth = await open("made-up-4");
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ code: "rate_limited" });
    expect(await query(db, "SELECT id FROM coder_sessions")).toHaveLength(3);
    // A device with a session isn't counted
    for (let i = 0; i < 5; i++) expect((await open("made-up-1")).status).toBe(200);
  });

  it("counts guessed links as new sessions", async () => {
    const app = createApp(db, { secret: "test-secret", devMode: true, rateLimits: { newSessions: 3 } });
    const guess = (deploymentId: string, n: number) =>
      app.request(`/api/d/${deploymentId}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": `guess-${n}` },
      });
    // The study not loaded yet, then loaded
    for (let n = 1; n <= 3; n++) expect((await guess(DEMO_PUBLIC_ID, n)).status).toBe(404);
    expect((await guess(DEMO_PUBLIC_ID, 4)).status).toBe(429);
    expect((await guess("aaaaaaaaaaaa", 5)).status).toBe(429);
  });

  it("refuses sessions without a login when the invitation requires sign-in", async () => {
    await redeploy({}, [crowd(undefined, { login: true })]);
    const res = await send("login", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth_required" });
  });
});

describe("the coder home", () => {
  it("summarizes this device's session in a deployment, never another device's, and never starts one", async () => {
    const c = coder("home");
    const unit = (await c.next())!;
    expect((await c.submit(unit.id, demo("positive"))).status).toBe(200);
    const summary = await send("home", "/summary");
    expect(summary.status).toBe(200);
    // The deployed design's public title, never the study's name (which is private)
    const first = (await summary.json()) as { title: unknown };
    expect(first).toMatchObject({ deployment: DEMO_PUBLIC_ID, title: "A tour of AnnoTinder", ended: null, units: 1 });
    expect(JSON.stringify(first)).not.toContain(
      (await query<{ name: string }>(db, "SELECT name FROM studies WHERE id = 1"))[0].name,
    );
    // Without one: none
    await query(
      db,
      "UPDATE design_versions SET public = NULL WHERE id = (SELECT design_version_id FROM deployments WHERE study_id = 1)",
    );
    expect(await (await send("home", "/summary")).json()).toMatchObject({ title: null });
    // Another device: no session here (and asking doesn't make one)
    expect((await send("elsewhere", "/summary")).status).toBe(404);
    const elsewhere = coder("elsewhere");
    await elsewhere.session();
    expect(await (await send("elsewhere", "/summary")).json()).toMatchObject({ units: 0 });
  });

  it("lists a logged-in coder's sessions, by their login's email, on any device", async () => {
    const c = coder("laptop");
    await c.session();
    const user = await ensureUser(db, "coder@uni.nl");
    await query(db, "UPDATE coder_sessions SET email = 'coder@uni.nl' WHERE id = (SELECT max(id) FROM coder_sessions)");
    const sessions = (cookie?: string) =>
      server.request("/api/coder/sessions", {
        headers: { "x-annotinder": "1", ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}) },
      });
    expect((await sessions()).status).toBe(401);
    const res = await sessions(await createSession(db, user.id, CODER_LOGIN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([expect.objectContaining({ deployment: DEMO_PUBLIC_ID, ended: null, units: 0 })]);
    // Someone else's login sees none of them
    const other = await ensureUser(db, "other@uni.nl");
    expect(await (await sessions(await createSession(db, other.id, CODER_LOGIN))).json()).toEqual([]);
  });

  it("keeps a logged-in person's own settings (theme, keys) for every device", async () => {
    const user = await ensureUser(db, "keys@uni.nl");
    const cookie = await createSession(db, user.id, CODER_LOGIN);
    const settings = (init: RequestInit = {}, login: string | null = cookie) =>
      server.request("/api/coder/settings", {
        ...init,
        headers: {
          "x-annotinder": "1",
          "content-type": "application/json",
          ...(login ? { cookie: `${SESSION_COOKIE}=${login}` } : {}),
        },
      });
    expect((await settings({}, null)).status).toBe(401);
    expect(await (await settings()).json()).toEqual({});
    const mine = { theme: "dark", answerKeys: true, keyMapping: "letters" };
    expect((await settings({ method: "PUT", body: JSON.stringify(mine) })).status).toBe(200);
    // Another device with the same login
    const device = await createSession(db, user.id, CODER_LOGIN);
    expect(await (await settings({}, device)).json()).toEqual(mine);
    // Only known settings
    expect((await settings({ method: "PUT", body: JSON.stringify({ keyMapping: "qwerty" }) })).status).toBe(400);
    expect((await settings({ method: "PUT", body: JSON.stringify({ other: 1 }) })).status).toBe(400);
  });
});

describe("loading a study", () => {
  const NOTHING = { error: "Nothing here: open the link you were given", code: "link_not_found" };
  const get = (deploymentId: string, path: string, headers: Record<string, string> = {}) =>
    server.request(`/api/d/${deploymentId}${path}`, { headers: { "x-annotinder": "1", ...headers } });

  it("needs a link, device or preview token of the study: other requests read nothing of it", async () => {
    const guesses = [
      get(DEMO_PUBLIC_ID, "/session"),
      get(DEMO_PUBLIC_ID, "/session", { "x-link-secret": "made-up" }),
      get(DEMO_PUBLIC_ID, "/session", { cookie: "annotinder_device=made-up" }),
      get(DEMO_PUBLIC_ID, "/summary", { cookie: "annotinder_device=made-up" }),
      get(DEMO_PUBLIC_ID, "/names", { "x-link-secret": "made-up" }),
      get(DEMO_PUBLIC_ID, "/loop/loop_1/next"),
      server.request(`/api/d/${DEMO_PUBLIC_ID}/transfer/redeem`, {
        method: "POST",
        headers: { "x-annotinder": "1", "content-type": "application/json" },
        body: JSON.stringify({ token: "x".repeat(32) }),
      }),
      // A study that doesn't exist answers the same
      get("aaaaaaaaaaaa", "/session", { "x-link-secret": "demo-secret" }),
      get("not-an-id", "/session"),
    ];
    for (const res of await Promise.all(guesses)) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(NOTHING);
    }
    const preview = await get(`${DEMO_PUBLIC_ID}.preview`, "/session", { "x-link-secret": "made-up" });
    expect(preview.status).toBe(401);
    expect(storeCalls).toEqual([]);

    // With the link it loads, and the device comes back without it (also after a restart)
    const c = coder("known");
    expect((await c.call("/session")).status).toBe(200);
    expect(storeCalls).toContain("getDeployment");
    useServer(restart());
    expect((await send("known", "/session")).status).toBe(200);
  });

  it("keeps at most so many studies in memory: the one used longest ago loads again", async () => {
    useServer(restart({ maxDeployments: 1 }));
    const c = coder("few");
    await c.session();
    forgetStoreCalls();
    await c.session();
    expect(storeCalls).not.toContain("getDeployment");
    // The study's preview is a second one
    const { deploymentId, token } = (await (
      await server.request("/api/study/1/deployment/preview", { method: "POST", headers: adminHeaders })
    ).json()) as { deploymentId: string; token: string };
    expect((await get(deploymentId, "/session", { "x-link-secret": token })).status).toBe(200);
    forgetStoreCalls();
    await c.session();
    expect(storeCalls).toContain("getDeployment");
  });
});
