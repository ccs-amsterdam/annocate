import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { CoderUnitResponse, DeploymentStatus, SessionResponse, VariableValue } from "@annotinder/contracts";
// The mock db server is used as-is (not a package dependency, only test code imports it).
import { createDb } from "../../../mock-server/src/db/schema.js";
import { seed } from "../../../mock-server/src/db/seed.js";
import { createApp } from "../../../mock-server/src/app.js";
import { createJobServer } from "../app.js";

// End-to-end: client -> job server -> mock db server, wired together with
// in-process fetch functions instead of real sockets.

const SECRET = "test-secret";
const DB_URL = "http://db.test";
const JOB_URL = "http://jobs.test";
const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

let db: DatabaseSync;
let dbApp: ReturnType<typeof createApp>;
let jobServer: ReturnType<typeof createJobServer>;

function routeTo(base: string, app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== base) throw new Error(`unexpected fetch to ${url}`);
    return app.request(url.pathname + url.search, init);
  }) as typeof fetch;
}

function newJobServer() {
  return createJobServer({ backends: { mock: { url: DB_URL, secret: SECRET } }, fetch: routeTo(DB_URL, dbApp) });
}

beforeEach(() => {
  db = createDb(":memory:");
  seed(db);
  dbApp = createApp(db, {
    backendSecret: SECRET,
    jobServer: {
      url: JOB_URL,
      backendName: "mock",
      secret: SECRET,
      fetch: routeTo(JOB_URL, { request: (path, init) => jobServer.request(path, init) }),
    },
  });
  jobServer = newJobServer();
});

function coder(key: string, invite: string | null = "demo-secret", server = () => jobServer) {
  const headers = { "content-type": "application/json", "x-coder-key": key, ...(invite ? { "x-invite-secret": invite } : {}) };
  const call = (path: string, init?: RequestInit) => server().request(`/d/mock.1${path}`, { ...init, headers });
  return {
    session: async () => (await call("/session")).json() as Promise<SessionResponse>,
    next: async (loop = "main_loop") => {
      const res = await call(`/loop/${loop}/next`);
      expect(res.status).toBe(200);
      return res.json() as Promise<CoderUnitResponse | null>;
    },
    submit: (unitId: number, variables: Record<string, Partial<VariableValue>>) =>
      call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId, variables }) }),
    call,
  };
}

const sentiment = (code: string) => ({ sentiment: { done: true, codes: [{ code }] } });

function dbAnnotations() {
  return db.prepare("SELECT unitId, coderId, variables FROM annotations ORDER BY unitId, coderId").all() as {
    unitId: number;
    coderId: number;
    variables: string;
  }[];
}

describe("coder flow through the job server", () => {
  it("serves the session and units, and writes annotations through to the db server", async () => {
    const c = coder("coder-a");
    const session = await c.session();
    expect(session.jobId).toBe(1);
    expect(session.codebook.name).toBe("Demo codebook");

    const first = await c.next();
    expect(first?.externalId).toBe("unit-1");
    expect(first?.data.headline).toBeTypeOf("string");

    expect((await c.submit(first!.id, sentiment("positive"))).status).toBe(204);
    expect(dbAnnotations()).toHaveLength(1);
    expect(JSON.parse(dbAnnotations()[0].variables).sentiment.codes[0].code).toBe("positive");

    expect((await c.next())?.externalId).toBe("unit-2");
    expect((await c.session()).progress).toEqual([{ unitset: "main_loop", doneUnitIds: [first!.id], totalUnits: 3 }]);
  });

  it("rejects invalid annotations without writing them", async () => {
    const c = coder("coder-a");
    const unit = await c.next();
    expect((await c.submit(unit!.id, { nope: { done: true } })).status).toBe(400);
    expect((await c.submit(unit!.id, sentiment("ecstatic"))).status).toBe(400);
    expect(dbAnnotations()).toHaveLength(0);
  });

  it("requires a valid invite for new coders", async () => {
    expect((await coder("coder-x", null).call("/session")).status).toBe(401);
    expect((await coder("coder-x", "wrong").call("/session")).status).toBe(401);
  });

  it("returns 404 for unknown or undeployed jobs", async () => {
    const headers = { "x-coder-key": "k", "x-invite-secret": "demo-secret" };
    expect((await jobServer.request("/d/other.1/session", { headers })).status).toBe(404);
    expect((await jobServer.request("/d/mock.99/session", { headers })).status).toBe(404);
  });

  it("rebuilds its state from the db server after a restart", async () => {
    const c = coder("coder-a");
    const first = await c.next();
    await c.submit(first!.id, sentiment("neutral"));

    jobServer = newJobServer(); // fresh process: empty memory
    const again = coder("coder-a", null);
    expect((await again.session()).progress[0].doneUnitIds).toEqual([first!.id]);
    expect((await again.next())?.externalId).toBe("unit-2");
  });

  it("skips units the db server no longer has", async () => {
    const unit3 = db.prepare("SELECT id FROM units WHERE externalId = 'unit-3'").get() as { id: number };
    expect((await dbApp.request(`/job/1/units/${unit3.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);

    const c = coder("coder-a");
    for (let i = 0; i < 2; i++) {
      const unit = await c.next();
      await c.submit(unit!.id, sentiment("neutral"));
    }
    expect(await c.next()).toBeNull();
  });
});

/** Creates a codebook with the given unit_loop settings and deploys it as a new version. */
async function redeploy(loop: object, extraItems: object[] = []) {
  const res = await dbApp.request("/job/1/codebook", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "v2",
      items: [
        ...extraItems,
        {
          type: "unit_loop",
          name: "main_loop",
          layout: { template: "" },
          children: [
            {
              type: "question",
              name: "sentiment",
              variable: { type: "select_code", question: "?", codes: [{ code: "positive" }, { code: "negative" }, { code: "neutral" }] },
            },
          ],
          ...loop,
        },
      ],
    }),
  });
  expect(res.status).toBe(201);
  const codebook = (await res.json()) as { id: number };
  const deploy = await dbApp.request("/job/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ codebookId: codebook.id }),
  });
  expect(deploy.status).toBe(200);
}

async function createUnitset(name: string, externalIds: string[]) {
  const ids = externalIds.map((e) => (db.prepare("SELECT id FROM units WHERE externalId = ?").get(e) as { id: number }).id);
  await dbApp.request("/job/1/unitsets", { method: "POST", headers: adminHeaders, body: JSON.stringify({ name, unitIds: ids }) });
  return ids;
}

async function invite(variables?: Record<string, string>, extra: object = {}) {
  const res = await dbApp.request("/job/1/coders/invite", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "x", variables, ...extra }),
  });
  return ((await res.json()) as { secret: string }).secret;
}

describe("dynamic sources", () => {
  it("pick up a redeploy and code each unit until coders agree", async () => {
    await coder("warmup").session(); // job server has the old version loaded
    await redeploy({
      units: [{ sources: [{ unitset: "main", dynamic: { maxCoders: 3, agreement: { variable: "sentiment", minAgree: 2 }, priority: "saturate" } }] }],
    });

    const answers: Record<string, string> = { a: "positive", b: "negative", c: "positive" };
    const firstUnits: number[] = [];
    for (const key of ["a", "b", "c"]) {
      const c = coder(key);
      const unit = await c.next();
      firstUnits.push(unit!.id);
      expect((await c.submit(unit!.id, sentiment(answers[key]))).status).toBe(204);
    }
    // saturate: everyone gets the same unit until it reaches agreement (a and c agree on the 3rd coding)
    expect(new Set(firstUnits).size).toBe(1);

    const d = coder("d");
    const unit = await d.next();
    expect(unit!.id).not.toBe(firstUnits[0]);

    const status = (await (await dbApp.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
    expect(status.version).toBe(2);
    expect(status.sources).toEqual([
      expect.objectContaining({ loop: "main_loop", unitset: "main", mode: "dynamic", completeUnits: 1, leasedUnits: 1, codings: 3, coders: 4 }),
    ]);
  });

  it("refuse annotations for units that were not handed to the coder", async () => {
    await redeploy({ units: [{ sources: [{ unitset: "main", dynamic: { maxCoders: 1 } }] }] });
    const a = coder("a");
    const b = coder("b");
    const unitA = await a.next();
    await b.next();
    expect((await b.submit(unitA!.id, sentiment("neutral"))).status).toBe(409);
  });
});

describe("routing coders to unitsets", () => {
  const slot = { type: "question", name: "slot", variable: { type: "auto", source: "invite", options: [{ code: "1" }, { code: "2" }], fallback: "balanced" } };
  const routedLoop = { units: [{ sources: [{ unitset: "part_{slot}" }, { unitset: "overlap" }] }] };

  it("route invited coders by their preset slot, and balance the rest", async () => {
    const [u1, u2, u3] = await createUnitset("part_1", ["unit-1"]).then(async (p1) => [
      ...p1,
      ...(await createUnitset("part_2", ["unit-2"])),
      ...(await createUnitset("overlap", ["unit-3"])),
    ]);
    await redeploy(routedLoop, [slot]);

    const alice = coder("alice", await invite({ slot: "2" }));
    expect((await alice.session()).variables.slot.codes).toEqual([{ code: "2" }]);
    expect((await alice.next())!.id).toBe(u2);

    // no preset: balanced fallback -> slot 1 (slot 2 already has alice)
    const general = await invite();
    const bob = coder("bob", general);
    expect((await bob.session()).variables.slot.codes).toEqual([{ code: "1" }]);
    const bobUnit = await bob.next();
    expect(bobUnit!.id).toBe(u1);
    await bob.submit(bobUnit!.id, sentiment("neutral"));
    expect((await bob.next())!.id).toBe(u3); // then the overlap set
  });

  it("keep routing sticky and don't let the client overwrite assigned variables", async () => {
    await createUnitset("part_1", ["unit-1"]);
    await createUnitset("part_2", ["unit-2"]);
    await createUnitset("overlap", ["unit-3"]);
    await redeploy(routedLoop, [slot]);

    const carol = coder("carol", await invite({ slot: "1" }));
    const first = await carol.next();
    const tamper = await carol.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { slot: { done: true, codes: [{ code: "2" }] } } }),
    });
    expect(tamper.status).toBe(204);
    expect((await carol.session()).variables.slot.codes).toEqual([{ code: "1" }]);

    // even after a restart, carol keeps her routing
    jobServer = newJobServer();
    const again = coder("carol", null);
    expect((await again.next())!.id).toBe(first!.id);
    const stored = db.prepare("SELECT assignments FROM coders WHERE devKey = 'carol'").get() as { assignments: string };
    expect(JSON.parse(stored.assignments)).toEqual({ main_loop: ["part_1", "overlap"] });
  });

  it("route by a coder's answer with `when`, first matching branch wins", async () => {
    const leaning = { type: "question", name: "leaning", variable: { type: "select_code", question: "?", codes: [{ code: "left" }, { code: "right" }] } };
    await createUnitset("left_units", ["unit-1"]);
    await redeploy(
      { units: [{ when: { leaning: "left" }, sources: [{ unitset: "left_units" }] }, { sources: [{ unitset: "main" }] }] },
      [leaning],
    );
    const lefty = coder("lefty");
    await lefty.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { leaning: { done: true, codes: [{ code: "left" }] } } }),
    });
    const unit = await lefty.next();
    await lefty.submit(unit!.id, sentiment("neutral"));
    expect(await lefty.next()).toBeNull(); // only the one unit in left_units

    const other = coder("other");
    expect((await other.next())!.externalId).toBe("unit-1"); // default branch: main
  });
});

describe("sessions across devices", () => {
  const raw = (headers: Record<string, string>, path: string, init: RequestInit = {}) =>
    jobServer.request(`/d/mock.1${path}`, { ...init, headers: { "content-type": "application/json", ...headers } });

  it("moves a session to another device with a one-time transfer link", async () => {
    const phone = coder("phone-key");
    const unit = await phone.next();
    await phone.submit(unit!.id, sentiment("neutral"));

    const transfer = (await (await phone.call("/transfer", { method: "POST" })).json()) as { token: string };
    const redeem = () => raw({}, "/transfer/redeem", { method: "POST", body: JSON.stringify({ token: transfer.token }) });
    const redeemed = await redeem();
    expect(redeemed.status).toBe(200);
    const { coderKey } = (await redeemed.json()) as { coderKey: string };
    expect(coderKey).toBe("phone-key");

    const laptop = coder(coderKey, null);
    expect((await laptop.session()).progress[0].doneUnitIds).toEqual([unit!.id]);

    const again = await redeem();
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ code: "transfer_invalid" });
  });

  it("never resumes a participant's session from a link alone", async () => {
    const secret = await invite(undefined, { participantFromUrl: true });
    const headers = (key: string, extra: Record<string, string> = {}) => ({
      "x-coder-key": key,
      "x-invite-secret": secret,
      "x-participant-id": "P123",
      ...extra,
    });

    const first = await raw(headers("device-1"), "/session");
    expect(first.status).toBe(200);
    const firstCoder = ((await first.json()) as SessionResponse).coderId;

    // Same participant link on a new device: explained refusal, not a resumed session.
    const second = await raw(headers("device-2"), "/session");
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "participant_has_session" });

    // Confirmed: a new, separate session with the same participant id.
    const confirmed = await raw(headers("device-2", { "x-new-session": "1" }), "/session");
    expect(confirmed.status).toBe(200);
    expect(((await confirmed.json()) as SessionResponse).coderId).not.toBe(firstCoder);
    const rows = db.prepare("SELECT participantId FROM coders WHERE participantId = 'P123'").all();
    expect(rows).toHaveLength(2);
  });

  it("refuses invites that require login (not supported yet)", async () => {
    const secret = await invite(undefined, { auth: "required" });
    const res = await raw({ "x-coder-key": "k", "x-invite-secret": secret }, "/session");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth_required" });
  });
});

describe("resuming and codebook updates", () => {
  it("serves units the coder already finished, but not other units", async () => {
    const c = coder("res");
    const first = await c.next();
    await c.submit(first!.id, sentiment("positive"));
    const again = await c.call(`/loop/main_loop/units/${first!.id}`);
    expect(again.status).toBe(200);
    expect(((await again.json()) as CoderUnitResponse).variables.sentiment.codes).toEqual([{ code: "positive" }]);

    const unit3 = (db.prepare("SELECT id FROM units WHERE externalId = 'unit-3'").get() as { id: number }).id;
    expect((await c.call(`/loop/main_loop/units/${unit3}`)).status).toBe(404);
  });

  it("keeps answers to questions a codebook update removed, and tags the codebook version", async () => {
    // demo codebook: sentiment + actors_and_issues + actor_relations
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...sentiment("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(204);

    const row = db.prepare("SELECT variables, codebookId FROM annotations WHERE unitId = ?").get(unit!.id) as {
      variables: string;
      codebookId: number;
    };
    const stored = JSON.parse(row.variables);
    expect(stored.sentiment.codes).toEqual([{ code: "positive" }]);
    expect(stored).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    expect(row.codebookId).toBe(2);
  });
});
