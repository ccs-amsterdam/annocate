import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type {
  CoderUnitResponse,
  DeploymentResponse,
  DeploymentStatus,
  SessionResponse,
  VariableValue,
} from "@annotinder/contracts";
// The mock db server is used as-is (not a package dependency, only test code imports it).
import { createDb } from "../../../mock-server/src/db/schema.js";
import { seed } from "../../../mock-server/src/db/seed.js";
import { createApp } from "../../../mock-server/src/app.js";
import { createJobServer } from "../app.js";
import type { RuntimeOptions } from "../runtime.js";

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

/** Backend API calls made by the job server (method + path, no query). */
let backendCalls: string[] = [];

function newJobServer(runtime: Partial<RuntimeOptions> = {}) {
  const toDb = routeTo(DB_URL, dbApp);
  const fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    backendCalls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return toDb(input, init);
  }) as typeof globalThis.fetch;
  return createJobServer({ backends: { mock: { url: DB_URL, secret: SECRET } }, fetch, runtime });
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
  backendCalls = [];
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
    submit: (unitId: number, variables: Record<string, Partial<VariableValue>>, loop?: string) =>
      call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId, loop, variables }) }),
    call,
  };
}

/** A finished unit in the one-question codebooks `redeploy` creates. */
const sentiment = (code: string) => ({ sentiment: { done: true, codes: [{ code }] } });
/** A finished unit in the seeded demo codebook: sentiment, plus its span and relation questions skipped. */
const demo = (code: string) => ({
  ...sentiment(code),
  actors_and_issues: { done: true, skip: true },
  actor_relations: { done: true, skip: true },
});

/** Live annotation values per (unit, coder), as stored by the db server. */
function dbAnnotations() {
  const rows = db
    .prepare("SELECT unitId, coderId, variable, value, codebookId FROM annotation_values WHERE retiredAt IS NULL ORDER BY unitId, coderId")
    .all() as { unitId: number; coderId: number; variable: string; value: string; codebookId: number }[];
  const byUnit = new Map<string, { unitId: number; coderId: number; variables: Record<string, VariableValue>; codebookIds: number[] }>();
  for (const row of rows) {
    const key = `${row.unitId}/${row.coderId}`;
    if (!byUnit.has(key)) byUnit.set(key, { unitId: row.unitId, coderId: row.coderId, variables: {}, codebookIds: [] });
    byUnit.get(key)!.variables[row.variable] = JSON.parse(row.value);
    byUnit.get(key)!.codebookIds.push(row.codebookId);
  }
  return [...byUnit.values()];
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

    expect((await c.submit(first!.id, demo("positive"))).status).toBe(204);
    expect(dbAnnotations()).toHaveLength(1);
    expect(dbAnnotations()[0].variables.sentiment.codes).toEqual([{ code: "positive" }]);

    expect((await c.next())?.externalId).toBe("unit-2");
    expect((await c.session()).progress).toEqual([{ unitset: "main_loop", doneUnitIds: [first!.id], totalUnits: 3 }]);
  });

  it("rejects invalid annotations without writing them", async () => {
    const c = coder("coder-a");
    const unit = await c.next();
    expect((await c.submit(unit!.id, { nope: { done: true } })).status).toBe(400);
    expect((await c.submit(unit!.id, demo("ecstatic"))).status).toBe(400);
    // only finished units are accepted: every question of the loop needs a value
    const partial = await c.submit(unit!.id, sentiment("positive"));
    expect(partial.status).toBe(400);
    expect(await partial.json()).toMatchObject({ error: expect.stringContaining("actors_and_issues") });
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
    await c.submit(first!.id, demo("neutral"));

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
      await c.submit(unit!.id, demo("neutral"));
    }
    expect(await c.next()).toBeNull();
  });
});

const sentimentQuestion = {
  type: "question",
  name: "sentiment",
  variable: { type: "select_code", question: "?", codes: [{ code: "positive" }, { code: "negative" }, { code: "neutral" }] },
};

/**
 * Creates a codebook with the given unit_loop settings (by default with one
 * question, `sentiment`) and deploys it as a new version. Returns the
 * deployment response.
 */
async function redeploy(loop: object, extraItems: object[] = []): Promise<DeploymentResponse> {
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
          children: [sentimentQuestion],
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
  return (await deploy.json()) as DeploymentResponse;
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

  it("load coders lazily, and keep balancing across a restart", async () => {
    await createUnitset("part_1", ["unit-1"]);
    await createUnitset("part_2", ["unit-2"]);
    await createUnitset("overlap", ["unit-3"]);
    await redeploy(routedLoop, [slot]);
    const general = await invite();
    expect((await coder("first", general).session()).variables.slot.codes).toEqual([{ code: "1" }]);

    // a fresh job server knows the counts per option, without loading all coders
    backendCalls = [];
    jobServer = newJobServer();
    expect((await coder("second", general).session()).variables.slot.codes).toEqual([{ code: "2" }]);
    expect(backendCalls).not.toContain("GET /backend/job/1/coders");
    expect(backendCalls).toContain("POST /backend/job/1/finished");

    // returning coders are resolved again, and count once
    expect((await coder("first", null).session()).variables.slot.codes).toEqual([{ code: "1" }]);
    expect((await coder("third", general).session()).variables.slot.codes).toEqual([{ code: "1" }]);

    // status still sees every coder, on demand
    const status = (await (await dbApp.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
    expect(status.coders).toBe(3);
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
    await phone.submit(unit!.id, demo("neutral"));

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
    await c.submit(first!.id, demo("positive"));
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
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(204);

    const [stored] = dbAnnotations();
    expect(stored.variables.sentiment.codes).toEqual([{ code: "positive" }]);
    expect(stored.variables).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    const sentimentRow = db.prepare("SELECT codebookId FROM annotation_values WHERE variable = 'sentiment'").get();
    expect(sentimentRow).toEqual({ codebookId: 2 });
  });
});

describe("rebuilding from the db server", () => {
  const agreeing = {
    units: [{ sources: [{ unitset: "main", dynamic: { maxCoders: 3, agreement: { variable: "sentiment", minAgree: 2 } } }] }],
  };
  const status = async () =>
    (await (await dbApp.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;

  it("keeps saturation the same across a restart with an agreement rule", async () => {
    await redeploy({
      units: [{ sources: [{ unitset: "main", dynamic: { maxCoders: 3, agreement: { variable: "sentiment", minAgree: 2 }, priority: "saturate" } }] }],
    });
    // two codings that disagree: the unit still needs a third coder
    const a = coder("a");
    const b = coder("b");
    const unit = await a.next();
    expect((await b.next())!.id).toBe(unit!.id);
    await a.submit(unit!.id, sentiment("positive"));
    await b.submit(unit!.id, sentiment("negative"));

    const before = (await status()).sources[0];
    jobServer = newJobServer();
    expect((await status()).sources[0]).toEqual({ ...before, leasedUnits: 0 });

    // still open after the restart; agreeing with a completes it
    const c = coder("c");
    expect((await c.next())!.id).toBe(unit!.id);
    await c.submit(unit!.id, sentiment("positive"));
    expect((await status()).sources[0]).toMatchObject({ completeUnits: 1, codings: 3 });
    jobServer = newJobServer();
    expect((await status()).sources[0]).toMatchObject({ completeUnits: 1, codings: 3 });
    expect((await coder("d").next())!.id).not.toBe(unit!.id);

    // the finished endpoint returns only the requested (agreement) values
    const finished = await dbApp.request("/backend/job/1/finished", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ loops: [{ loop: "main_loop", variables: ["sentiment"], values: ["sentiment"] }] }),
    });
    const rows = (await finished.json()) as { values: Record<string, unknown> }[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => Object.keys(r.values).join() === "sentiment")).toBe(true);
  });

  it("keeps answers to removed questions when resubmitting after a restart", async () => {
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`

    jobServer = newJobServer();
    const again = coder("upd", null);
    expect((await again.submit(unit!.id, sentiment("positive"))).status).toBe(204);
    expect(dbAnnotations()[0].variables).toHaveProperty("actors_and_issues");
  });

  it("keeps codings across a redeploy that keeps the loops, and reloads when they change", async () => {
    const reloads = () =>
      backendCalls.filter((call) => call === "POST /backend/job/1/finished" || call === "GET /backend/job/1/annotations");

    // v2 changes the loop's questions (demo had three): finished units must be re-derived
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] });
    const c = coder("re");
    await c.submit((await c.next())!.id, sentiment("neutral"));
    backendCalls = [];

    // v3, same loop: nothing re-downloaded
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] });
    expect((await c.next())?.externalId).toBe("unit-2");
    expect(reloads()).toEqual([]);

    // v4 adds a dynamic source with an agreement rule: its finished codings are loaded
    await redeploy(agreeing);
    await c.session();
    expect(reloads()).toContain("POST /backend/job/1/finished");
  });

  it("keeps the order of finished units when an old unit is edited", async () => {
    const c = coder("order");
    const first = await c.next();
    await c.submit(first!.id, demo("neutral"));
    const second = await c.next();
    await c.submit(second!.id, demo("neutral"));
    await new Promise((r) => setTimeout(r, 5)); // a later timestamp for the edit
    expect((await c.submit(first!.id, demo("positive"))).status).toBe(204);

    jobServer = newJobServer();
    expect((await coder("order", null).session()).progress[0].doneUnitIds).toEqual([first!.id, second!.id]);
  });
});

describe("finished units follow the current codebook", () => {
  const relevance = {
    type: "question",
    name: "relevance",
    variable: { type: "select_code", question: "?", codes: [{ code: "yes" }, { code: "no" }] },
  };
  const fixedMain = { units: [{ sources: [{ unitset: "main" }] }] };

  it("reopens finished units when a loop gains a question, and warns on deploy", async () => {
    expect((await redeploy(fixedMain)).warnings).toBeUndefined();
    const c = coder("grow");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("positive"));
    expect((await c.session()).progress[0].doneUnitIds).toEqual([unit!.id]);

    const deployed = await redeploy({ ...fixedMain, children: [sentimentQuestion, relevance] });
    expect(deployed.warnings).toEqual([expect.stringContaining("relevance")]);

    // the unit is unfinished again: served first, with the earlier answer
    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(unit!.id);
    expect(again!.variables.sentiment.codes).toEqual([{ code: "positive" }]);
    await c.submit(unit!.id, { ...sentiment("positive"), relevance: { done: true, codes: [{ code: "yes" }] } });
    expect((await c.session()).progress[0].doneUnitIds).toEqual([unit!.id]);
  });

  it("serves units again after a researcher resets them, keeping the old values", async () => {
    await redeploy(fixedMain);
    const c = coder("reset");
    const first = await c.next();
    await c.submit(first!.id, sentiment("negative"));
    expect((await c.next())!.id).not.toBe(first!.id);

    const res = await dbApp.request("/job/1/annotations/reset", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["sentiment"], unitIds: [first!.id] }),
    });
    expect(await res.json()).toEqual({ retired: 1 });

    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(first!.id);
    expect(again!.variables).toEqual({}); // retired values are not served
    expect(db.prepare("SELECT COUNT(*) AS n FROM annotation_values WHERE retiredAt IS NOT NULL").get()).toEqual({ n: 1 });
  });

  it("tracks a unit separately in each loop it appears in", async () => {
    const second = {
      type: "unit_loop",
      name: "second_loop",
      layout: { template: "" },
      units: [{ sources: [{ unitset: "main" }] }],
      children: [relevance],
    };
    await redeploy(fixedMain, [second]);
    const c = coder("two");
    const unit = await c.next("main_loop");
    expect((await c.submit(unit!.id, sentiment("neutral"), "main_loop")).status).toBe(204);

    // finished in main_loop, not in second_loop
    expect((await c.next("main_loop"))!.id).not.toBe(unit!.id);
    expect((await c.next("second_loop"))!.id).toBe(unit!.id);
    const progress = Object.fromEntries((await c.session()).progress.map((p) => [p.unitset, p.doneUnitIds]));
    expect(progress).toEqual({ second_loop: [], main_loop: [unit!.id] });
  });
});

describe("memory", () => {
  const status = async () =>
    (await (await dbApp.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
  const refresh = (body: object) =>
    dbApp.request("/job/1/deployment/refresh", { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
  const count = (call: string) => backendCalls.filter((c) => c === call).length;
  const UNITS = "GET /backend/job/1/units";
  const ANNOTATIONS = "GET /backend/job/1/annotations";

  it("keeps units cached until a refresh drops them", async () => {
    const c = coder("units");
    const unit = (await c.next())!;
    await c.submit(unit.id, demo("neutral"));
    db.prepare("UPDATE units SET data = ? WHERE id = ?").run(JSON.stringify({ text: "fixed" }), unit.id);

    const back = async () => ((await (await c.call(`/loop/main_loop/units/${unit.id}`)).json()) as CoderUnitResponse).data;
    expect(await back()).toEqual(unit.data); // cached: no change, no fetch
    expect((await refresh({ units: [unit.id] })).status).toBe(200);
    expect(await back()).toEqual({ text: "fixed" });
  });

  it("drops the least recently used units when over budget", async () => {
    jobServer = newJobServer({ unitCacheBytes: 1 });
    const c = coder("budget");
    const unit = (await c.next())!;
    await c.submit(unit.id, demo("neutral"));
    expect((await c.call(`/loop/main_loop/units/${unit.id}`)).status).toBe(200);
    expect(count(UNITS)).toBe(2); // nothing fits, so fetched again
    expect((await status()).memory?.unitBytes).toBe(0);
  });

  it("drops coders who are done first when over budget, and rebuilds them on return", async () => {
    await createUnitset("one", ["unit-1"]);
    await redeploy({ units: [{ sources: [{ unitset: "one" }] }] });
    const measure = coder("measure");
    await measure.submit((await measure.next())!.id, sentiment("neutral"));
    const perCoder = (await status()).memory!.coderBytes;
    expect(perCoder).toBeGreaterThan(0);

    jobServer = newJobServer({ workspaceCacheBytes: Math.floor(perCoder * 2.5) });
    const busy = coder("busy");
    await busy.submit((await busy.next())!.id, sentiment("neutral")); // least recent, not done
    const done = coder("done");
    await done.submit((await done.next())!.id, sentiment("neutral"));
    expect(await done.next()).toBeNull(); // every loop exhausted: done
    const third = coder("third");
    await third.submit((await third.next())!.id, sentiment("neutral")); // over budget

    backendCalls = [];
    await busy.session();
    expect(count(ANNOTATIONS)).toBe(0);
    expect(await done.next()).toBeNull(); // reloaded, and still finished
    expect(count(ANNOTATIONS)).toBe(1);
  });

  it("forgets idle coders and deployments", async () => {
    let now = Date.now();
    jobServer = newJobServer({ now: () => now, deploymentIdleMs: 1000 * 60 * 60_000 });
    const c = coder("idle");
    await c.submit((await c.next())!.id, demo("neutral"));
    backendCalls = [];
    now += 25 * 60 * 60_000; // past maxIdleMs
    await c.session();
    expect(count(ANNOTATIONS)).toBe(1);

    jobServer = newJobServer({ now: () => now });
    await c.session();
    backendCalls = [];
    now += 7 * 60 * 60_000; // past deploymentIdleMs: loaded afresh
    await c.session();
    expect(backendCalls).toContain("GET /backend/job/1/deployment");
    expect(count(ANNOTATIONS)).toBe(1);
  });
});
