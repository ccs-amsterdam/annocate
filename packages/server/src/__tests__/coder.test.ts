import { beforeEach, describe, expect, it } from "vitest";
import type {
  CoderUnitResponse,
  DeploymentResponse,
  DeploymentStatus,
  SessionResponse,
  UnitData,
  VariableValue,
} from "@annotinder/contracts";
import type { Sql } from "../db.js";
import { emptyDb } from "./testDb.js";
import { seed } from "../seed.js";
import { createApp } from "../app.js";
import type { RuntimeOptions } from "../runtime/runtime.js";
import { DbStore, type Store } from "../runtime/store.js";
import { unitHash } from "../shared/units.js";

// End-to-end: client -> server -> database, through the app's fetch handler
// (no sockets). A new app on the same database is a restart.

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

let db: Sql;
let server: ReturnType<typeof createApp>;

/** What the runtime read or wrote (Store method names), in order. */
let storeCalls: string[] = [];

/** Records every Store call in `storeCalls`. */
function recording(store: Store): Store {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        storeCalls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/** A (re)started server on the same database: empty memory. */
function restart(runtime: Partial<RuntimeOptions> = {}) {
  return createApp(db, { secret: "test-secret", runtime, wrapStore: recording, devAuth: true });
}

beforeEach(async () => {
  db = await emptyDb();
  await seed(db);
  server = restart();
  storeCalls = [];
  devices = new Map();
});

/**
 * Simulated browsers, by name: their cookies, and the invite link they were
 * opened with (a reload sends it again, like the client does from the URL).
 */
let devices = new Map<string, { cookies: Map<string, string>; invite: string | null }>();

/** A request from a device: sends its cookies and the client header, keeps cookies it is given. */
async function send(name: string, path: string, init: RequestInit = {}, headers: Record<string, string> = {}, app = () => server) {
  let device = devices.get(name);
  if (!device) devices.set(name, (device = { cookies: new Map(), invite: null }));
  const cookie = [...device.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await app().request(`/d/1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-annotinder": "1",
      ...(cookie ? { cookie } : {}),
      ...(init.headers as Record<string, string> | undefined),
      ...headers,
    },
  });
  for (const set of res.headers.getSetCookie()) {
    const [pair] = set.split(";");
    const at = pair.indexOf("=");
    device.cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return res;
}

/** The query a client sends with the branch it chose (contracts NextUnitQuerySchema). */
function branchQuery(branch?: { branch: number; unitsets: string[] }) {
  if (!branch) return "";
  const query = new URLSearchParams({ branch: String(branch.branch) });
  for (const name of branch.unitsets) query.append("unitsets", name);
  return `?${query}`;
}

/** A coder on device `name`, opened with `invite` (`null`: the link the device was opened with before, if any). */
function coder(name: string, invite: string | null = "demo-secret", app = () => server) {
  if (!devices.has(name)) devices.set(name, { cookies: new Map(), invite: null });
  const device = devices.get(name)!;
  if (invite !== null) device.invite = invite;
  const call = (path: string, init?: RequestInit) =>
    send(name, path, init, device.invite ? { "x-invite-secret": device.invite } : {}, app);
  return {
    session: async () => (await call("/session")).json() as Promise<SessionResponse>,
    next: async (loop = "main_loop", branch?: { branch: number; unitsets: string[] }) => {
      const res = await call(`/loop/${loop}/next${branchQuery(branch)}`);
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
/** A finished unit in the seeded demo codebook: sentiment, plus its other loop questions skipped. */
const demo = (code: string) => ({
  ...sentiment(code),
  is_news: { done: true, skip: true },
  topics: { done: true, skip: true },
  actors_and_issues: { done: true, skip: true },
  framing: { done: true, skip: true },
  usefulness: { done: true, skip: true },
});

async function unitByExternalId(externalId: string): Promise<{ id: number }> {
  return (await db.query<{ id: number }>("SELECT id FROM units WHERE external_id = $1", [externalId]))[0];
}

/** Live annotation values per (unit, coder), as stored in the database. */
async function dbAnnotations() {
  const rows = await db.query<{ unitId: number; coderId: number; variable: string; value: VariableValue; codebookId: number }>(
    `SELECT unit_id AS "unitId", coder_id AS "coderId", variable, value, codebook_id AS "codebookId"
     FROM annotation_values WHERE retired_at IS NULL ORDER BY unit_id, coder_id`,
  );
  const byUnit = new Map<string, { unitId: number; coderId: number; variables: Record<string, VariableValue>; codebookIds: number[] }>();
  for (const row of rows) {
    const key = `${row.unitId}/${row.coderId}`;
    if (!byUnit.has(key)) byUnit.set(key, { unitId: row.unitId, coderId: row.coderId, variables: {}, codebookIds: [] });
    byUnit.get(key)!.variables[row.variable] = row.value;
    byUnit.get(key)!.codebookIds.push(row.codebookId);
  }
  return [...byUnit.values()];
}

describe("coder flow", () => {
  it("serves the session and units, and stores annotations", async () => {
    const c = coder("coder-a");
    const session = await c.session();
    expect(session.jobId).toBe(1);
    expect(session.codebook.note).toBe("Demo: a tour of AnnoTinder's question types and features");

    const first = await c.next();
    expect(first?.externalId).toBe("unit-1");
    expect(first?.data.headline).toBeTypeOf("string");

    expect((await c.submit(first!.id, demo("positive"))).status).toBe(204);
    expect(await dbAnnotations()).toHaveLength(1);
    expect((await dbAnnotations())[0].variables.sentiment.codes).toEqual([{ code: "positive" }]);

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
    expect(await dbAnnotations()).toHaveLength(0);
  });

  it("requires a valid invite for new coders", async () => {
    expect((await coder("coder-x", null).call("/session")).status).toBe(401);
    expect((await coder("coder-x", "wrong").call("/session")).status).toBe(401);
  });

  it("returns 404 for unknown or undeployed jobs", async () => {
    const headers = { "x-annotinder": "1", "x-invite-secret": "demo-secret" };
    expect((await server.request("/d/other/session", { headers })).status).toBe(404);
    expect((await server.request("/d/99/session", { headers })).status).toBe(404);
  });

  it("rebuilds its state from the database after a restart", async () => {
    const c = coder("coder-a");
    const first = await c.next();
    await c.submit(first!.id, demo("neutral"));

    server = restart(); // fresh process: empty memory
    const again = coder("coder-a", null);
    expect((await again.session()).progress[0].doneUnitIds).toEqual([first!.id]);
    expect((await again.next())?.externalId).toBe("unit-2");
  });

  it("skips units that were deleted", async () => {
    const unit3 = await unitByExternalId("unit-3");
    expect((await server.request(`/job/1/units/${unit3.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);

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
  const res = await server.request("/job/1/codebook", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      note: "v2",
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
  const deploy = await server.request("/job/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ codebookId: codebook.id }),
  });
  expect(deploy.status).toBe(200);
  return (await deploy.json()) as DeploymentResponse;
}

async function createUnitset(name: string, externalIds: string[]) {
  const ids = await Promise.all(externalIds.map(async (e) => (await unitByExternalId(e)).id));
  await server.request("/job/1/unitsets", { method: "POST", headers: adminHeaders, body: JSON.stringify({ name, unitIds: ids }) });
  return ids;
}

async function invite(variables?: Record<string, string>, extra: object = {}) {
  const res = await server.request("/job/1/invites", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "x", variables, ...extra }),
  });
  return ((await res.json()) as { secret: string }).secret;
}

describe("dynamic sources", () => {
  it("pick up a redeploy and code each unit until coders agree", async () => {
    await coder("warmup").session(); // the server has the old version loaded
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

    const status = (await (await server.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
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
  const routedLoop = { units: [{ sources: [{ unitset: "part_$var.slot.code" }, { unitset: "overlap" }] }] };
  const part = (n: number) => ({ branch: 0, unitsets: [`part_${n}`, "overlap"] });

  it("route invited coders by their preset slot, and balance the rest", async () => {
    const [u1, u2, u3] = await createUnitset("part_1", ["unit-1"]).then(async (p1) => [
      ...p1,
      ...(await createUnitset("part_2", ["unit-2"])),
      ...(await createUnitset("overlap", ["unit-3"])),
    ]);
    await redeploy(routedLoop, [slot]);

    const alice = coder("alice", await invite({ slot: "2" }));
    expect((await alice.session()).variables.slot.codes).toEqual([{ code: "2" }]);
    // the client fills in the unitset names; without them the server can't route
    const required = await alice.call("/loop/main_loop/next");
    expect(required.status).toBe(409);
    expect(await required.json()).toMatchObject({ code: "branch_required" });
    expect((await alice.next("main_loop", part(2)))!.id).toBe(u2);

    // no preset: balanced fallback -> slot 1 (slot 2 already has alice)
    const general = await invite();
    const bob = coder("bob", general);
    expect((await bob.session()).variables.slot.codes).toEqual([{ code: "1" }]);
    const bobUnit = await bob.next("main_loop", part(1));
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

    // a restarted server knows the counts per option, without loading all coders
    storeCalls = [];
    server = restart();
    expect((await coder("second", general).session()).variables.slot.codes).toEqual([{ code: "2" }]);
    expect(storeCalls).not.toContain("listCoders");
    expect(storeCalls).toContain("listFinished");

    // returning coders are resolved again, and count once
    expect((await coder("first", null).session()).variables.slot.codes).toEqual([{ code: "1" }]);
    expect((await coder("third", general).session()).variables.slot.codes).toEqual([{ code: "1" }]);

    // status still sees every coder, on demand
    const status = (await (await server.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
    expect(status.coders).toBe(3);
  });

  it("keep routing sticky and don't let the client overwrite assigned variables", async () => {
    await createUnitset("part_1", ["unit-1"]);
    await createUnitset("part_2", ["unit-2"]);
    await createUnitset("overlap", ["unit-3"]);
    await redeploy(routedLoop, [slot]);

    const carol = coder("carol", await invite({ slot: "1" }));
    // names that don't fit the branch, or don't exist, are refused
    expect((await carol.call(`/loop/main_loop/next${branchQuery({ branch: 0, unitsets: ["main", "overlap"] })}`)).status).toBe(400);
    expect((await carol.call(`/loop/main_loop/next${branchQuery({ branch: 1, unitsets: ["part_1", "overlap"] })}`)).status).toBe(400);
    expect((await carol.call(`/loop/main_loop/next${branchQuery(part(3))}`)).status).toBe(409);
    const first = await carol.next("main_loop", part(1));
    const tamper = await carol.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { slot: { done: true, codes: [{ code: "2" }] } } }),
    });
    expect(tamper.status).toBe(204);
    expect((await carol.session()).variables.slot.codes).toEqual([{ code: "1" }]);

    // even after a restart, carol keeps her routing (another choice is ignored)
    server = restart();
    const again = coder("carol", null);
    expect((await again.next())!.id).toBe(first!.id);
    expect((await again.next("main_loop", part(2)))!.id).toBe(first!.id);
    const { coderId } = await again.session();
    const [stored] = await db.query<{ assignments: unknown }>("SELECT assignments FROM coders WHERE id = $1", [coderId]);
    expect(stored.assignments).toEqual({ main_loop: ["part_1", "overlap"] });
  });

  it("route by the branch the client chose", async () => {
    const leaning = { type: "question", name: "leaning", variable: { type: "select_code", question: "?", codes: [{ code: "left" }, { code: "right" }] } };
    await createUnitset("left_units", ["unit-1"]);
    await redeploy(
      {
        units: [
          { when: { rules: [{ ref: "$var.leaning.code", op: "is", value: "left" }] }, sources: [{ unitset: "left_units" }] },
          { sources: [{ unitset: "main" }] },
        ],
      },
      [leaning],
    );
    const lefty = coder("lefty");
    await lefty.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { leaning: { done: true, codes: [{ code: "left" }] } } }),
    });
    // the client evaluated `when` and chose branch 0
    const unit = await lefty.next("main_loop", { branch: 0, unitsets: ["left_units"] });
    await lefty.submit(unit!.id, sentiment("neutral"));
    expect(await lefty.next()).toBeNull(); // only the one unit in left_units

    const other = coder("other");
    expect((await other.call("/loop/main_loop/next")).status).toBe(409); // two branches: the client must choose
    expect((await other.next("main_loop", { branch: 1, unitsets: ["main"] }))!.externalId).toBe("unit-1");
  });
});

describe("sessions", () => {
  it("keeps the session in an httpOnly cookie, and stores only a hash of it", async () => {
    const res = await send("browser", "/session", {}, { "x-invite-secret": "demo-secret" });
    expect(res.status).toBe(200);
    const [set] = res.headers.getSetCookie();
    expect(set).toMatch(/^annotinder_[0-9a-f]{16}=/);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/d/1");

    const value = [...devices.get("browser")!.cookies.values()][0];
    const { coderId } = (await res.json()) as SessionResponse;
    const [{ stored }] = await db.query<{ stored: string }>("SELECT coder_key AS stored FROM coders WHERE id = $1", [coderId]);
    const { createHash } = await import("node:crypto");
    expect(stored).toBe(createHash("sha256").update(value).digest("hex"));

    // the cookie continues the session; it isn't set again
    const again = await send("browser", "/session", {}, { "x-invite-secret": "demo-secret" });
    expect(((await again.json()) as SessionResponse).coderId).toBe(coderId);
    expect(again.headers.getSetCookie()).toEqual([]);
  });

  it("refuses requests without the client header (CSRF)", async () => {
    const res = await server.request("/d/1/session", { headers: { "x-invite-secret": "demo-secret" } });
    expect(res.status).toBe(403);
  });

  it("continues a device's session whatever link it comes back with; separate per participant", async () => {
    const other = await invite();
    const a = (await (await send("shared", "/session", {}, { "x-invite-secret": "demo-secret" })).json()) as SessionResponse;
    const b = (await (await send("shared", "/session", {}, { "x-invite-secret": other })).json()) as SessionResponse;
    const bare = (await (await send("shared", "/session")).json()) as SessionResponse; // no invite at all
    expect(b.coderId).toBe(a.coderId);
    expect(bare.coderId).toBe(a.coderId);
    expect(devices.get("shared")!.cookies.size).toBe(1);

    const panel = await invite(undefined, { participantFromUrl: true });
    const p1 = (await (await send("shared", "/session", {}, { "x-invite-secret": panel, "x-participant-id": "P1" })).json()) as SessionResponse;
    expect(p1.coderId).not.toBe(a.coderId);
    expect(devices.get("shared")!.cookies.size).toBe(2);
  });

  it("sets no cookie when the invite is refused", async () => {
    const res = await send("nobody", "/session", {}, { "x-invite-secret": "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("sessions across devices", () => {
  it("moves a session to another device with a one-time transfer link", async () => {
    const phone = coder("phone");
    const unit = await phone.next();
    await phone.submit(unit!.id, demo("neutral"));

    const transfer = (await (await phone.call("/transfer", { method: "POST" })).json()) as { token: string };
    // The link carries no invite: the laptop gets the session cookie for that.
    const redeem = () => send("laptop", "/transfer/redeem", { method: "POST", body: JSON.stringify({ token: transfer.token }) });
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
    const secret = await invite(undefined, { participantFromUrl: true });
    const link = { "x-invite-secret": secret, "x-participant-id": "P123" };

    const first = await send("device-1", "/session", {}, link);
    expect(first.status).toBe(200);
    const firstCoder = ((await first.json()) as SessionResponse).coderId;

    // Same participant link on a new device: explained refusal, not a resumed session.
    const second = await send("device-2", "/session", {}, link);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "participant_has_session" });

    // Confirmed: a new, separate session with the same participant id.
    const confirmed = await send("device-2", "/session", {}, { ...link, "x-new-session": "1" });
    expect(confirmed.status).toBe(200);
    const secondCoder = ((await confirmed.json()) as SessionResponse).coderId;
    expect(secondCoder).not.toBe(firstCoder);
    const rows = await db.query("SELECT participant_id FROM coders WHERE participant_id = 'P123'");
    expect(rows).toHaveLength(2);

    // and that device keeps its new session
    const reload = await send("device-2", "/session", {}, link);
    expect(((await reload.json()) as SessionResponse).coderId).toBe(secondCoder);
  });

  it("refuses invites that require login (not supported yet)", async () => {
    const secret = await invite(undefined, { auth: "required" });
    const res = await send("login", "/session", {}, { "x-invite-secret": secret });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth_required" });
  });
});

describe("resuming and codebook updates", () => {
  it("refuses requests made with an older codebook version, until the session is loaded again", async () => {
    const c = coder("v");
    const { version } = await c.session();
    const unit = await c.next();
    const withVersion = (v: number) => ({ headers: { "x-annotinder-version": String(v) } });
    const answers = JSON.stringify({ unitId: unit!.id, variables: demo("neutral") });

    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`
    const stale = await c.call("/variables/unit", { method: "POST", body: answers, ...withVersion(version) });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "codebook_changed" });
    expect(await dbAnnotations()).toHaveLength(0);

    // The session itself is always served, with the new version.
    const reloaded = (await (await c.call("/session", withVersion(version))).json()) as SessionResponse;
    expect(reloaded.version).toBe(version + 1);
    const fresh = await c.call("/variables/unit", {
      method: "POST",
      body: JSON.stringify({ unitId: unit!.id, variables: sentiment("neutral") }),
      ...withVersion(reloaded.version),
    });
    expect(fresh.status).toBe(204);
  });

  it("serves units the coder already finished, but not other units", async () => {
    const c = coder("res");
    const first = await c.next();
    await c.submit(first!.id, demo("positive"));
    const again = await c.call(`/loop/main_loop/units/${first!.id}`);
    expect(again.status).toBe(200);
    expect(((await again.json()) as CoderUnitResponse).variables.sentiment.codes).toEqual([{ code: "positive" }]);

    const unit3 = (await unitByExternalId("unit-3")).id;
    expect((await c.call(`/loop/main_loop/units/${unit3}`)).status).toBe(404);
  });

  it("keeps answers to questions a codebook update removed, and tags the codebook version", async () => {
    // demo codebook: sentiment + actors_and_issues + other loop questions
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(204);

    const [stored] = await dbAnnotations();
    expect(stored.variables.sentiment.codes).toEqual([{ code: "positive" }]);
    expect(stored.variables).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    const sentimentRows = await db.query(`SELECT codebook_id AS "codebookId" FROM annotation_values WHERE variable = 'sentiment'`);
    expect(sentimentRows).toEqual([{ codebookId: 2 }]);
  });
});

describe("rebuilding from the database", () => {
  const agreeing = {
    units: [{ sources: [{ unitset: "main", dynamic: { maxCoders: 3, agreement: { variable: "sentiment", minAgree: 2 } } }] }],
  };
  const status = async () =>
    (await (await server.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;

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
    server = restart();
    expect((await status()).sources[0]).toEqual({ ...before, leasedUnits: 0 });

    // still open after the restart; agreeing with a completes it
    const c = coder("c");
    expect((await c.next())!.id).toBe(unit!.id);
    await c.submit(unit!.id, sentiment("positive"));
    expect((await status()).sources[0]).toMatchObject({ completeUnits: 1, codings: 3 });
    server = restart();
    expect((await status()).sources[0]).toMatchObject({ completeUnits: 1, codings: 3 });
    expect((await coder("d").next())!.id).not.toBe(unit!.id);

    // the finished query returns only the requested (agreement) values
    const rows = await new DbStore(db, 1).listFinished({ loops: [{ loop: "main_loop", variables: ["sentiment"], values: ["sentiment"] }] });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => Object.keys(r.values ?? {}).join() === "sentiment")).toBe(true);
  });

  it("keeps answers to removed questions when resubmitting after a restart", async () => {
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }); // v2: only `sentiment`

    server = restart();
    const again = coder("upd", null);
    expect((await again.submit(unit!.id, sentiment("positive"))).status).toBe(204);
    expect((await dbAnnotations())[0].variables).toHaveProperty("actors_and_issues");
  });

  it("keeps codings across a redeploy that keeps the loops, and reloads when they change", async () => {
    const reloads = () =>
      storeCalls.filter((call) => call === "listFinished" || call === "listAnnotations");

    // v2 changes the loop's questions (demo had six): finished units must be re-derived
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] });
    const c = coder("re");
    await c.submit((await c.next())!.id, sentiment("neutral"));
    storeCalls = [];

    // v3, same loop: nothing re-downloaded
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] });
    expect((await c.next())?.externalId).toBe("unit-2");
    expect(reloads()).toEqual([]);

    // v4 adds a dynamic source with an agreement rule: its finished codings are loaded
    await redeploy(agreeing);
    await c.session();
    expect(reloads()).toContain("listFinished");
  });

  it("keeps the order of finished units when an old unit is edited", async () => {
    const c = coder("order");
    const first = await c.next();
    await c.submit(first!.id, demo("neutral"));
    const second = await c.next();
    await c.submit(second!.id, demo("neutral"));
    await new Promise((r) => setTimeout(r, 5)); // a later timestamp for the edit
    expect((await c.submit(first!.id, demo("positive"))).status).toBe(204);

    server = restart();
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

    const res = await server.request("/job/1/annotations/reset", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["sentiment"], unitIds: [first!.id] }),
    });
    expect(await res.json()).toEqual({ retired: 1 });

    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(first!.id);
    expect(again!.variables).toEqual({}); // retired values are not served
    expect(await db.query("SELECT COUNT(*)::int AS n FROM annotation_values WHERE retired_at IS NOT NULL")).toEqual([{ n: 1 }]);
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
    (await (await server.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
  const refresh = (body: object) =>
    server.request("/job/1/deployment/refresh", { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
  const count = (call: string) => storeCalls.filter((c) => c === call).length;
  const UNITS = "getUnits";
  const ANNOTATIONS = "listAnnotations";

  it("keeps units cached until a refresh drops them", async () => {
    const c = coder("units");
    const unit = (await c.next())!;
    await c.submit(unit.id, demo("neutral"));
    await db.query("UPDATE units SET data = $1 WHERE id = $2", [JSON.stringify({ text: "fixed" }), unit.id]);

    const back = async () => ((await (await c.call(`/loop/main_loop/units/${unit.id}`)).json()) as CoderUnitResponse).data;
    expect(await back()).toEqual(unit.data); // cached: no change, no fetch
    expect((await refresh({ units: [unit.id] })).status).toBe(200);
    expect(await back()).toEqual({ text: "fixed" });
  });

  it("drops the least recently used units when over budget", async () => {
    server = restart({ unitCacheBytes: 1 });
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

    server = restart({ workspaceCacheBytes: Math.floor(perCoder * 2.5) });
    const busy = coder("busy");
    await busy.submit((await busy.next())!.id, sentiment("neutral")); // least recent, not done
    const done = coder("done");
    await done.submit((await done.next())!.id, sentiment("neutral"));
    expect(await done.next()).toBeNull(); // every loop exhausted: done
    const third = coder("third");
    await third.submit((await third.next())!.id, sentiment("neutral")); // over budget

    storeCalls = [];
    await busy.session();
    expect(count(ANNOTATIONS)).toBe(0);
    expect(await done.next()).toBeNull(); // reloaded, and still finished
    expect(count(ANNOTATIONS)).toBe(1);
  });

  it("forgets idle coders and deployments", async () => {
    let now = Date.now();
    server = restart({ now: () => now, deploymentIdleMs: 1000 * 60 * 60_000 });
    const c = coder("idle");
    await c.submit((await c.next())!.id, demo("neutral"));
    storeCalls = [];
    now += 25 * 60 * 60_000; // past maxIdleMs
    await c.session();
    expect(count(ANNOTATIONS)).toBe(1);

    server = restart({ now: () => now });
    await c.session();
    storeCalls = [];
    now += 7 * 60 * 60_000; // past deploymentIdleMs: loaded afresh
    await c.session();
    expect(storeCalls).toContain("getDeployment");
    expect(count(ANNOTATIONS)).toBe(1);
  });
});

describe("unit hashes", () => {
  const shownHashes = () =>
    db.query<{ unitId: number; unitHash: string | null }>(
      `SELECT DISTINCT unit_id AS "unitId", unit_hash AS "unitHash" FROM annotation_values WHERE retired_at IS NULL`,
    );

  it("record which content a coder saw, when the unit changed after it was served", async () => {
    const c = coder("hash");
    const first = (await c.next())!;
    await c.submit(first.id, demo("neutral"));
    expect(await shownHashes()).toEqual([{ unitId: first.id, unitHash: null }]); // current content

    const second = (await c.next())!;
    const [before] = await db.query<{ externalId: string; data: UnitData }>(`SELECT external_id AS "externalId", data FROM units WHERE id = $1`, [second.id]);
    // The researcher overwrites it while the coder has it open (allowed: not annotated yet).
    const res = await server.request("/job/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        overwrite: true,
        // Same fields (the job's), new text
        units: [{ externalId: before.externalId, data: { ...before.data, text: "edited" } }],
      }),
    });
    expect(res.status).toBe(201); // recorded, not refused
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(204); // recorded, not refused

    const shown = unitHash(before.externalId, before.data);
    expect((await shownHashes()).find((r) => r.unitId === second.id)?.unitHash).toBe(shown);
  });
});

describe("researcher preview", () => {
  const draft = async (note: string) => {
    const res = await server.request("/job/1/codebook", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        note,
        items: [{ type: "unit_loop", name: "main_loop", layout: { template: "" }, children: [sentimentQuestion], units: [{ sources: [{ unitset: "main" }] }] }],
      }),
    });
    expect(res.status).toBe(201);
  };
  const openPreview = async () => {
    const res = await server.request("/job/1/deployment/preview", { method: "POST", headers: adminHeaders });
    expect(res.status).toBe(200);
    return (await res.json()) as { deploymentId: string; token: string };
  };
  /** A browser on the preview deployment, with its own cookie. */
  const previewer = (deploymentId: string, token: string) => {
    let cookie = "";
    return async (path: string, init: RequestInit = {}) => {
      const res = await server.request(`/d/${deploymentId}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-annotinder": "1", "x-invite-secret": token, cookie },
      });
      const [set] = res.headers.getSetCookie();
      if (set) cookie = set.split(";")[0];
      return res;
    };
  };

  it("runs the latest codebook, deployed or not, and picks up edits", async () => {
    await draft("draft 1");
    const { deploymentId, token } = await openPreview();
    expect(deploymentId).toBe("1.preview");
    const call = previewer(deploymentId, token);
    expect(((await (await call("/session")).json()) as SessionResponse).codebook.note).toBe("draft 1");
    // the real deployment is untouched
    expect((await coder("real").session()).codebook.note).not.toBe("draft 1");

    await draft("draft 2");
    expect(((await (await call("/session")).json()) as SessionResponse).codebook.note).toBe("draft 2");
  });

  it("keeps the preview's coders and answers out of the database", async () => {
    await draft("draft");
    const coders = async () => (await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM coders"))[0].n;
    const before = await coders();
    const { deploymentId, token } = await openPreview();
    const call = previewer(deploymentId, token);
    const unit = (await (await call("/loop/main_loop/next")).json()) as CoderUnitResponse;
    const submit = await call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId: unit.id, variables: sentiment("neutral") }) });
    expect(submit.status).toBe(204);
    expect(((await (await call("/session")).json()) as SessionResponse).progress[0].doneUnitIds).toEqual([unit.id]);
    expect(await dbAnnotations()).toEqual([]);
    expect(await coders()).toBe(before);
  });

  it("refuses forged, expired and other jobs' tokens", async () => {
    await draft("draft");
    const { token } = await openPreview();
    const [, , exp, sig] = token.split(".");
    const tries = [
      `preview.1.${exp}.${"0".repeat(64)}`, // forged
      `preview.1.${Date.now() - 1000}.${sig}`, // expired (and so the signature no longer matches either)
      token.replace("preview.1.", "preview.2."), // another job
    ];
    for (const t of tries) expect((await previewer("1.preview", t)("/session")).status).toBe(401);
  });
});

describe("url_param auto variables", () => {
  const source = (options?: string[]) => ({
    type: "question",
    name: "source",
    variable: { type: "auto", source: "url_param", urlParam: "src", ...(options && { options: options.map((code) => ({ code })) }) },
  });
  const fromUrl = (name: string, params: string) => send(name, "/session", {}, { "x-invite-secret": "demo-secret", "x-url-params": params });
  const sourceOf = async (res: Response) => ((await res.json()) as SessionResponse).variables.source?.codes?.[0]?.code;

  it("are stored when the coder starts, and kept without the URL", async () => {
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }, [source()]);
    expect(await sourceOf(await fromUrl("p", "src=panelA&other=x"))).toBe("panelA");
    // a later visit without the parameter, even after a restart
    server = restart();
    expect(await sourceOf(await send("p", "/session"))).toBe("panelA");
    // and the client can't overwrite it
    await send("p", "/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { source: { done: true, codes: [{ code: "panelB" }] } } }),
    });
    expect(await sourceOf(await fromUrl("p", "src=panelB"))).toBe("panelA");
  });

  it("ignore values outside the options, and are filled in when they come later", async () => {
    await redeploy({ units: [{ sources: [{ unitset: "main" }] }] }, [source(["a", "b"])]);
    expect(await sourceOf(await fromUrl("q", "src=zzz"))).toBeUndefined();
    expect(await sourceOf(await fromUrl("q", "src=b"))).toBe("b");
  });
});
