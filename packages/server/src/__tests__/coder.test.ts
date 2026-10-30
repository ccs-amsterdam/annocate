import { beforeEach, describe, expect, it } from "vitest";
import type {
  CoderProgress,
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
import { ensureUser } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";

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
function branchQuery(branch?: number) {
  return branch === undefined ? "" : `?branch=${branch}`;
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
    next: async (loop = "1", branch?: number) => {
      const res = await call(`/loop/${loop}/next${branchQuery(branch)}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { units: CoderUnitResponse[] }).units[0] ?? null;
    },
    batch: async (count: number, loop = "1") => {
      const res = await call(`/loop/${loop}/next?count=${count}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { units: CoderUnitResponse[] }).units;
    },
    submit: (unitId: number, variables: Record<string, Partial<VariableValue>>, loop?: string) =>
      call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId, loop, variables }) }),
    call,
  };
}

/** A finished unit in the one-question codebooks `redeploy` creates. */
const sentiment = (code: string) => ({ sentiment: { done: true, values: [{ value: code }] } });
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
/** Unit answers in the database, per unit and coder. */
async function dbAnnotations() {
  const rows = await db.query<{ unitId: number; coderId: number; variable: string; value: VariableValue; codebookId: number }>(
    `SELECT unit_id AS "unitId", coder_id AS "coderId", variable, value, codebook_id AS "codebookId"
     FROM annotation_values WHERE unit_id IS NOT NULL AND retired_at IS NULL ORDER BY unit_id, coder_id`,
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
    expect((await dbAnnotations())[0].variables.sentiment.values).toEqual([{ value: "positive" }]);

    expect((await c.next())?.externalId).toBe("unit-2");
    expect((await c.session()).progress).toEqual([{ unitset: "1", doneUnitIds: [first!.id], totalUnits: 3 }]);
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
  variable: { type: "nominal", question: "?", options: [{ value: "positive" }, { value: "negative" }, { value: "neutral" }] },
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
          label: "main_loop",
          units: [{ mode: "all" }],
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

/** Adds a set to a group (group `g` by default), replacing a set of that name. Returns its unit ids. */
async function createSet(name: string, externalIds: string[], group = "g") {
  const ids = await Promise.all(externalIds.map(async (e) => (await unitByExternalId(e)).id));
  const groups = (await (await server.request("/job/1/sets", { headers: adminHeaders })).json()) as { name: string; sets: { name: string }[] }[];
  const sets = (groups.find((g) => g.name === group)?.sets ?? []).filter((s) => s.name !== name);
  const res = await server.request(`/job/1/sets/${group}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ sets: [...sets, { name, unitIds: ids }] }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return ids;
}

/** The published codebook's links: params -> secret. */
async function links(): Promise<{ id: number; secret: string; params: Record<string, string>; retiredAt: string | null }[]> {
  return (await (await server.request("/job/1/invites", { headers: adminHeaders })).json()) as never;
}

let extraLinks = 0;
/**
 * Another link to the job, with these access settings (as a researcher sets
 * them on a link). Made directly: links come from the published codebook,
 * so a later publish retires it.
 */
async function invite(settings: { auth?: string; emails?: string[]; participantId?: string; maxUses?: number } = {}) {
  const secret = `extra-${++extraLinks}`;
  const [{ id }] = await db.query<{ id: number }>(
    "INSERT INTO invites (job_id, label, auth, secret, link_key) VALUES (1, 'x', 'none', $1, $2) RETURNING id",
    [secret, JSON.stringify(["test", extraLinks])],
  );
  const res = await server.request(`/job/1/invites/${id}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ label: "x", ...settings }) });
  expect(res.status).toBe(200);
  return secret;
}

/** A Session item (contracts SessionItemSchema). */
const sessionItem = (extra: object) => ({ type: "session", params: [], ...extra });

describe("shared queues", () => {
  it("pick up a redeploy and code each unit until coders agree", async () => {
    await coder("warmup").session(); // the server has the old version loaded
    await redeploy({
      units: [{ mode: "shared", until: { agree: 2, on: "sentiment" }, maxCoders: 3, priority: "saturate" }],
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
      expect.objectContaining({ loop: "main_loop", unitset: "__all__", mode: "dynamic", completeUnits: 1, leasedUnits: 1, codings: 3, coders: 4 }),
    ]);
  });

  it("refuse annotations for units that were not handed to the coder", async () => {
    await redeploy({ units: [{ mode: "shared", until: { coders: 1 }, maxCoders: 1 }] });
    const a = coder("a");
    const b = coder("b");
    const unitA = await a.next();
    await b.next();
    expect((await b.submit(unitA!.id, sentiment("neutral"))).status).toBe(409);
  });
});

describe("shared queues under concurrency", () => {
  it("count a unit finished while another coder's pick reads the queue", async () => {
    // b's pick reads the queue's leases and codings; a finishes their unit in
    // between (in b's transaction here: PGlite has one connection). However
    // the reads are ordered, b must see a's coding or a's lease.
    let between: ((store: Store) => Promise<void>) | null = null;
    const racing = (store: Store): Store =>
      new Proxy(store, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== "function") return value;
          if (prop === "locked") {
            return (key: string, fn: (s: Store) => Promise<unknown>) => target.locked(key, (s) => fn(racing(s)));
          }
          return async (...args: unknown[]) => {
            const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
            const finish = between;
            if (finish && (prop === "listLeases" || prop === "listCodings") && (args[0] as { loop?: string }).loop) {
              between = null;
              await finish(target);
            }
            return result;
          };
        },
      });
    server = createApp(db, { secret: "test-secret", wrapStore: racing, devAuth: true });
    await redeploy({ units: [{ mode: "shared", until: { coders: 1 }, maxCoders: 1 }] });
    const a = coder("a");
    const unitA = (await a.next())!;
    const { coderId } = await a.session();
    between = (store) => store.putAnnotation({ unitId: unitA.id, coderId, variables: { sentiment: { done: true, skip: false, values: [{ value: "neutral" }] } }, codings: [{ loop: "1", agreement: {} }] });
    const unitB = await coder("b").next();
    expect(between).toBeNull();
    expect(unitB?.id).not.toBe(unitA.id);
  });
});

describe("assigned sets", () => {
  const assign = (from: object, overlap: object = { placement: "disabled" }) => ({ units: [{ mode: "assign", group: "g", from, overlap }] });

  it("draws the set with the fewest coders, counting dropouts only for 24 hours", async () => {
    let clock = Date.parse("2026-11-01T12:00:00Z");
    server = restart({ now: () => clock });
    await createSet("s1", ["unit-1"]);
    await createSet("s2", ["unit-2"]);
    await redeploy(assign({ draw: "balanced" }));

    const a = coder("a");
    const unitA = await a.next();
    expect(unitA!.externalId).toBe("unit-1");
    expect((await a.submit(unitA!.id, sentiment("positive"))).status).toBe(204); // a finished s1
    expect((await coder("b").next())!.externalId).toBe("unit-2"); // b starts s2, and stops

    // An hour later both sets have a coder: the first set again.
    clock += 60 * 60 * 1000;
    expect((await coder("c").next())!.externalId).toBe("unit-1");
    // A day later b counts no longer, but a (who finished) and c (still active) do.
    clock += 25 * 60 * 60 * 1000;
    expect((await coder("d").next())!.externalId).toBe("unit-2");
  });

  it("keeps a coder's set when the loop is moved or relabelled, not when how sets are assigned changes", async () => {
    await createSet("s1", ["unit-1"]);
    await createSet("s2", ["unit-2"]);
    await redeploy(assign({ draw: "balanced" }));
    expect((await coder("a").next())!.externalId).toBe("unit-1");
    expect((await coder("b").next())!.externalId).toBe("unit-2");

    // Another loop in front: this one is loop 2 now, and has another label. b still has s2.
    const warmUp = { type: "question", name: "warm_up", variable: { type: "confirm", question: "?" } };
    const before = { type: "unit_loop", label: "warm-up", layout: { template: "" }, units: [{ mode: "all", set: { group: "g", set: "s1" } }], children: [warmUp] };
    await redeploy({ label: "renamed", ...assign({ draw: "balanced" }) }, [before]);
    expect((await coder("b").next("2"))!.externalId).toBe("unit-2");

    // Drawn at random instead: a new routing (with random() = 0, the first set).
    server = restart({ random: () => 0 });
    await redeploy(assign({ draw: "random" }));
    expect((await coder("b").next())!.externalId).toBe("unit-1");
    // A set that no longer exists: routed again.
    await createSet("s1", ["unit-3"], "h");
    await server.request("/job/1/sets/g", { method: "PUT", headers: adminHeaders, body: JSON.stringify({ sets: [{ name: "s2", unitIds: [(await unitByExternalId("unit-2")).id] }] }) });
    expect((await coder("b").next())!.externalId).toBe("unit-2");
  });

  it("hands out the overlap first, last or spread, at most `max` of them, besides the coder's own units", async () => {
    await createSet("s1", ["unit-1", "unit-2"]);
    await createSet("_overlap", ["unit-2", "unit-3"]);
    const order = async (name: string) => {
      const c = coder(name);
      const seen: string[] = [];
      for (let u = await c.next(); u; u = await c.next()) {
        seen.push(u.externalId);
        await c.submit(u.id, sentiment("positive"));
      }
      return seen;
    };
    await redeploy(assign({ draw: "balanced" }, { placement: "first", max: 1 }));
    // unit-2 is overlap, not own: once, as overlap; only the first overlap unit
    expect(await order("first")).toEqual(["unit-2", "unit-1"]);
    await redeploy(assign({ draw: "random" }, { placement: "last" }));
    expect(await order("last")).toEqual(["unit-1", "unit-2", "unit-3"]);
    // Disabled: the set as it is (the _overlap set plays no part)
    await redeploy(assign({ draw: "random" }, { placement: "disabled" }));
    expect(await order("none")).toEqual(["unit-1", "unit-2"]);
  });

  it("takes the set from a link parameter: one link per set, retired when its set goes", async () => {
    await createSet("s1", ["unit-1"]);
    await createSet("s2", ["unit-2"]);
    const deployed = await redeploy(assign({ session: "part" }), [sessionItem({ params: [{ name: "part", kind: "link", values: { sets: "g" } }] })]);
    expect(deployed.links).toBe(2);
    const bySet = Object.fromEntries((await links()).filter((l) => !l.retiredAt).map((l) => [l.params.part, l.secret]));
    expect(Object.keys(bySet).sort()).toEqual(["s1", "s2"]);
    const c = coder("two", bySet.s2);
    expect((await c.session()).session).toEqual({ part: "s2" });
    expect((await c.next())!.externalId).toBe("unit-2");

    // A third set: a third link, without publishing again. Removing s1 retires its link.
    await createSet("s3", ["unit-3"]);
    expect((await links()).filter((l) => !l.retiredAt)).toHaveLength(3);
    await server.request("/job/1/sets/g", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ sets: [{ name: "s2", unitIds: [(await unitByExternalId("unit-2")).id] }, { name: "s3", unitIds: [(await unitByExternalId("unit-3")).id] }] }),
    });
    const retired = await send("late", "/session", {}, { "x-invite-secret": bySet.s1 });
    expect(retired.status).toBe(403);
    expect(await retired.json()).toMatchObject({ code: "link_inactive" });
    // The demo link (no link parameters before) is retired too: the codebook makes only set links now
    expect((await send("demo", "/session", {}, { "x-invite-secret": "demo-secret" })).status).toBe(403);
    // A group the codebook uses can't be deleted
    expect((await server.request("/job/1/sets/g", { method: "DELETE", headers: adminHeaders })).status).toBe(409);
  });

  it("takes the set from the login's email: only those emails may start", async () => {
    await createSet("a@example.org", ["unit-1"]);
    await createSet("b@example.org", ["unit-2"]);
    await redeploy(assign({ session: "email" }));
    expect(await (await send("anon", "/session", {}, { "x-invite-secret": "demo-secret" })).json()).toMatchObject({ code: "auth_required" });
    const login = async (device: string, email: string) => {
      const user = await ensureUser(db, email);
      devices.set(device, { cookies: new Map([["annotinder_session", await createSession(db, user.id)]]), invite: null });
    };
    await login("stranger", "c@example.org");
    expect(await (await send("stranger", "/session", {}, { "x-invite-secret": "demo-secret" })).json()).toMatchObject({ code: "email_not_invited" });
    await login("b", "B@example.org");
    expect((await coder("b").next())!.externalId).toBe("unit-2");
  });

  it("are handed out without a new codebook version, as are new units", async () => {
    await redeploy(assign({ draw: "balanced" }));
    // No sets yet: no units, until there are
    expect(await coder("early").next()).toBeNull();
    const set = await createSet("late", ["unit-2"]);
    expect((await coder("early").next())!.id).toBe(set[0]);

    // New units join "all units"
    await redeploy({});
    const c = coder("all");
    const seen: string[] = [];
    for (let u = await c.next(); u; u = await c.next()) {
      seen.push(u.externalId);
      await c.submit(u.id, sentiment("positive"));
    }
    const [{ data: before }] = await db.query<{ data: Record<string, unknown> }>("SELECT data FROM units WHERE job_id = 1 LIMIT 1");
    const upload = await server.request("/job/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "unit-new", data: { ...before, text: "New" } }] }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    expect((await c.next())!.externalId).toBe("unit-new");
  });
});

describe("routing by branch", () => {
  it("keeps routing sticky and refuses branches that don't exist", async () => {
    await createSet("s1", ["unit-1"]);
    await createSet("s2", ["unit-2"]);
    const condition = { type: "question", name: "condition", variable: { type: "auto", source: "balanced", options: [{ value: "s1" }, { value: "s2" }] } };
    await redeploy(
      {
        units: [
          { when: { script: `$var.condition.is("s1")` }, mode: "all", set: { group: "g", set: "s1" } },
          { when: { script: `$var.condition.is("s2")` }, mode: "all", set: { group: "g", set: "s2" } },
        ],
      },
      [condition],
    );
    const carol = coder("carol");
    expect((await carol.session()).variables.condition.values).toEqual([{ value: "s1" }]);
    const required = await carol.call("/loop/1/next");
    expect(required.status).toBe(409);
    expect(await required.json()).toMatchObject({ code: "branch_required" });
    expect((await carol.call(`/loop/1/next${branchQuery(5)}`)).status).toBe(400);
    const first = await carol.next("1", 0);
    expect(first!.externalId).toBe("unit-1");
    // the client can't overwrite assigned variables
    const tamper = await carol.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { condition: { done: true, values: [{ value: "s2" }] } } }),
    });
    expect(tamper.status).toBe(204);
    expect((await carol.session()).variables.condition.values).toEqual([{ value: "s1" }]);

    // even after a restart, carol keeps her routing (another choice is ignored)
    server = restart();
    const again = coder("carol", null);
    expect((await again.next())!.id).toBe(first!.id);
    expect((await again.next("1", 1))!.id).toBe(first!.id);
    const { coderId } = await again.session();
    const [stored] = await db.query<{ assignments: unknown }>("SELECT assignments FROM coders WHERE id = $1", [coderId]);
    expect(Object.values(stored.assignments as object)).toEqual([{ set: "g/s1", at: expect.any(Number) }]);

    // balanced across a restart: the counts are in the database
    expect((await coder("dave").session()).variables.condition.values).toEqual([{ value: "s2" }]);
  });

  it("routes by the branch the client chose", async () => {
    const leaning = { type: "question", name: "leaning", variable: { type: "nominal", question: "?", options: [{ value: "left" }, { value: "right" }] } };
    await createSet("left_units", ["unit-1"]);
    await redeploy(
      {
        units: [
          { when: { script: `$var.leaning.is("left")` }, mode: "all", set: { group: "g", set: "left_units" } },
          { mode: "all" },
        ],
      },
      [leaning],
    );
    const lefty = coder("lefty");
    await lefty.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { leaning: { done: true, values: [{ value: "left" }] } } }),
    });
    // the client evaluated `when` and chose branch 0
    const unit = await lefty.next("1", 0);
    await lefty.submit(unit!.id, sentiment("neutral"));
    expect(await lefty.next()).toBeNull(); // only the one unit in left_units

    const other = coder("other");
    expect((await other.call("/loop/1/next")).status).toBe(409); // two branches: the client must choose
    expect((await other.next("1", 1))!.externalId).toBe("unit-1");
  });
});

describe("sessions", () => {
  it("keeps a device id in an httpOnly cookie; stores only a per-job hash of it, with coarse device details", async () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const res = await send("browser", "/session", {}, { "x-invite-secret": "demo-secret", "user-agent": iphone });
    expect(res.status).toBe(200);
    const [set] = res.headers.getSetCookie();
    expect(set).toMatch(/^annotinder_device=/);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/d");

    const deviceId = devices.get("browser")!.cookies.get("annotinder_device")!;
    const { coderId } = (await res.json()) as SessionResponse;
    const [stored] = await db.query<{ key_hash: string; device_type: string; browser: string; os: string }>(
      "SELECT key_hash, device_type, browser, os FROM coder_devices WHERE coder_id = $1",
      [coderId],
    );
    const { createHash } = await import("node:crypto");
    expect(stored).toEqual({ key_hash: createHash("sha256").update(`${deviceId}\n1\n`).digest("hex"), device_type: "phone", browser: "Safari", os: "iOS" });
    // The device id itself is stored nowhere
    expect(JSON.stringify(await db.query("SELECT * FROM coders"))).not.toContain(deviceId);

    // the cookie continues the session; it isn't set again
    const again = await send("browser", "/session", {}, { "x-invite-secret": "demo-secret" });
    expect(((await again.json()) as SessionResponse).coderId).toBe(coderId);
    expect(again.headers.getSetCookie()).toEqual([]);
  });

  it("records the device each answer was given on", async () => {
    const c = coder("answerer");
    const unit = await c.next();
    await c.submit(unit!.id, demo("neutral"));
    const rows = await db.query<{ device_id: number | null }>("SELECT DISTINCT device_id FROM annotation_values WHERE unit_id = $1", [unit!.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].device_id).not.toBeNull();
    const listed = (await (await server.request("/job/1/devices", { headers: adminHeaders })).json()) as { id: number }[];
    expect(listed.map((d) => d.id)).toContain(rows[0].device_id);
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

    await redeploy({}, [sessionItem({ participant: { param: "participant" } })]);
    const panel = "demo-secret";
    const p1 = (await (await send("shared", "/session", {}, { "x-invite-secret": panel, "x-url-params": "participant=P1" })).json()) as SessionResponse;
    const p2 = (await (await send("shared", "/session", {}, { "x-invite-secret": panel, "x-url-params": "participant=P2" })).json()) as SessionResponse;
    expect(new Set([a.coderId, p1.coderId, p2.coderId]).size).toBe(3);
    // One cookie for all of it
    expect(devices.get("shared")!.cookies.size).toBe(1);
  });

  it("knows a deployment by one spelling only", async () => {
    for (const id of ["01", "0001.preview", "1e3", "99999999999"]) {
      const res = await server.request(`/d/${id}/session`, { headers: { "x-annotinder": "1", "x-invite-secret": "demo-secret" } });
      expect(res.status).toBe(404);
    }
  });

  it("sets no cookie when the invite is refused", async () => {
    const res = await send("nobody", "/session", {}, { "x-invite-secret": "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("URL parameters", () => {
  it("start only with them (fitting their values), and keep them as $session values", async () => {
    await redeploy({}, [
      sessionItem({
        participant: { param: "PROLIFIC_PID", pattern: "[0-9a-f]{4}" },
        params: [
          { name: "study", kind: "url", param: "STUDY_ID", values: { open: {} } },
          { name: "src", kind: "url", values: { list: [{ value: "panel" }, { value: "mail" }] } },
          { name: "wave", kind: "url", values: { open: { pattern: "[0-9]" } }, default: "1" },
        ],
      }),
    ]);
    const start = (device: string, params: string) => send(device, "/session", {}, { "x-invite-secret": "demo-secret", "x-url-params": params });

    const missing = await start("u1", "PROLIFIC_PID=ab12&src=panel");
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: "url_param_missing", error: expect.stringContaining("STUDY_ID") });
    const invalid = await start("u2", "PROLIFIC_PID=xyz&STUDY_ID=s1&src=panel");
    expect(await invalid.json()).toMatchObject({ code: "url_param_invalid" });
    expect((await (await start("u3", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=web")).json()) as object).toMatchObject({ code: "url_param_invalid" });
    // Values are at most 256 characters, with or without a pattern
    expect((await (await start("u5", `PROLIFIC_PID=ab12&STUDY_ID=${"s".repeat(300)}&src=mail`)).json()) as object).toMatchObject({ code: "url_param_invalid" });

    const okRes = await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail&source=newsletter&other=x");
    const ok = (await okRes.json()) as SessionResponse;
    expect(okRes.status, JSON.stringify(ok)).toBe(200);
    expect(ok.session).toEqual({ participant: "ab12", study: "s1", src: "mail", wave: "1", source: "newsletter" });
    // The same link again (the client sends the page's parameters with every request): the same session
    const again = (await (await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail")).json()) as SessionResponse;
    expect(again.coderId).toBe(ok.coderId);
    // Kept without the other parameters, also after a restart (the participant id is part of the device's session key)
    server = restart();
    expect(((await (await send("u4", "/session", {}, { "x-url-params": "PROLIFIC_PID=ab12" })).json()) as SessionResponse).session).toEqual(ok.session);
    const coders = (await (await server.request("/job/1/coders", { headers: adminHeaders })).json()) as CoderProgress[];
    expect(coders.find((c) => c.participantId === "ab12")?.session, JSON.stringify(coders)).toEqual({ study: "s1", src: "mail", wave: "1", source: "newsletter" });
  });
});

describe("quitting and deleting a coder's data", () => {
  it("lets a coder quit and ask for deletion; the researcher deletes later, then now, and the deletion is logged", async () => {
    await redeploy({}, [sessionItem({ participant: { param: "participant" } })]);
    const link = { "x-invite-secret": "demo-secret", "x-url-params": "participant=P77" };
    const unit = ((await (await send("quitter", "/loop/1/next", {}, link)).json()) as { units: CoderUnitResponse[] }).units[0];
    expect((await send("quitter", "/variables/unit", { method: "POST", body: JSON.stringify({ unitId: unit.id, variables: sentiment("positive") }) }, link)).status).toBe(204);

    const quit = await send("quitter", "/quit", { method: "POST", body: JSON.stringify({ requestDeletion: true }) }, link);
    expect(quit.status).toBe(204);
    const session = (await (await send("quitter", "/session", {}, link)).json()) as SessionResponse;
    expect(session.ended).toMatchObject({ outcome: "quit" });
    expect(session.deletionRequest).toMatchObject({ at: expect.any(String) });
    expect((await send("quitter", "/loop/1/next", {}, link)).status).toBe(409);

    const listed = async () =>
      ((await (await server.request("/job/1/coders", { headers: adminHeaders })).json()) as CoderProgress[]).find((c) => c.participantId === "P77");
    const before = (await listed())!;
    expect(before.deletionRequest).toMatchObject({ at: expect.any(String) });
    expect((await server.request(`/job/1/coders/${before.id}/deletion-request/postpone`, { method: "POST", headers: adminHeaders })).status).toBe(204);
    expect((await listed())!.deletionRequest).toMatchObject({ postponedAt: expect.any(String) });

    const del = await server.request("/job/1/coders/delete", { method: "POST", headers: adminHeaders, body: JSON.stringify({ participantIds: ["P77"] }) });
    expect(await del.json()).toEqual({ coderIds: [before.id], answers: 1 });
    expect(await listed()).toBeUndefined();
    const log = await (await server.request("/job/1/coders/deletions", { headers: adminHeaders })).json();
    expect(log).toEqual([
      expect.objectContaining({ coderId: before.id, participantId: "P77", requestedAt: expect.any(String), deletedAt: expect.any(String), answers: 1 }),
    ]);
    expect((await db.query("SELECT 1 FROM annotation_values WHERE coder_id = $1", [before.id])).length).toBe(0);
    // Nothing matches: nothing deleted
    const none = await server.request("/job/1/coders/delete", { method: "POST", headers: adminHeaders, body: JSON.stringify({ emails: ["x@y.z"] }) });
    expect(await none.json()).toEqual({ coderIds: [], answers: 0 });
  });
});

describe("coder-level answers", () => {
  it("are answer rows without a unit, one per question, assigned values marked; only changed answers are written", async () => {
    const group = { type: "question", name: "group", variable: { type: "auto", source: "random", options: [{ value: "a" }, { value: "b" }] } };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    const city = { type: "question", name: "city", variable: { type: "nominal", question: "City?", options: [{ value: "Utrecht" }, { value: "Gent" }] } };
    await redeploy({}, [group, age, city]);
    const c = coder("surveyed");
    await c.session();
    const post = (variables: object) => c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    expect((await post({ age: value(30), city: value("Utrecht") })).status).toBe(204);
    expect((await post({ age: value(31), city: value("Utrecht") })).status).toBe(204);

    const rows = await db.query<{ variable: string; unit_id: number | null; assigned: boolean; created: Date; updated: Date; device_id: number | null }>(
      "SELECT variable, unit_id, assigned, created, updated, device_id FROM annotation_values WHERE unit_id IS NULL ORDER BY variable",
    );
    expect(rows.map((r) => [r.variable, r.assigned])).toEqual([
      ["age", false],
      ["city", false],
      ["group", true],
    ]);
    const [ageRow, cityRow] = rows;
    expect(ageRow.updated.getTime()).toBeGreaterThanOrEqual(cityRow.updated.getTime()); // only age was written again
    expect(cityRow.created.getTime()).toBe(cityRow.updated.getTime());
    expect(ageRow.device_id).not.toBeNull();

    // In the download too, without a unit; and on the coder
    const page = (await (await server.request("/job/1/annotations", { headers: adminHeaders })).json()) as { annotations: { unitId: number | null; variable: string; assigned: boolean }[] };
    expect(page.annotations.filter((a) => a.unitId === null).map((a) => a.variable).sort()).toEqual(["age", "city", "group"]);
    const coders = (await (await server.request("/job/1/coders", { headers: adminHeaders })).json()) as CoderProgress[];
    expect(coders[0].variables).toMatchObject({ age: value(31), city: value("Utrecht") });
    // A reload (a restart of the runtime) reads them back
    server = restart();
    expect((await c.session()).variables).toMatchObject({ age: value(31) });
  });
});

describe("pausing a job", () => {
  it("lets coders save what they have, gives no new units or sessions, and doesn't reload coders", async () => {
    const c = coder("working");
    const [first, second] = await c.batch(2);
    const before = (await c.session()).version;
    const deployment = (await (await server.request("/job/1/deployment", { headers: adminHeaders })).json()) as { codebookId: number };
    const pause = (active: boolean) =>
      server.request("/job/1/deployment", { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId: deployment.codebookId, active }) });
    await pause(false);
    expect((await c.session()).version).toBe(before); // no reload for coders
    // What they have open is saved
    expect((await c.submit(first.id, demo("neutral"))).status).toBe(204);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(204);
    // No new units, no new sessions
    const next = await c.call("/loop/1/next");
    expect(next.status).toBe(409);
    expect(await next.json()).toMatchObject({ code: "job_paused" });
    const newcomer = await coder("newcomer").call("/session");
    expect(newcomer.status).toBe(409);
    expect(await newcomer.json()).toMatchObject({ code: "job_paused" });
    // Resumed: they go on
    await pause(true);
    expect((await c.next())?.externalId).toBe("unit-3");
    expect((await coder("newcomer").call("/session")).status).toBe(200);
  });
});

describe("frozen answers", () => {
  it("an answer a unit loop depends on can't change once the coder coded a unit there", async () => {
    const role = { type: "question", name: "role", variable: { type: "nominal", question: "Role?", options: [{ value: "student" }, { value: "expert" }] } };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    await redeploy({ layout: { template: "As {{$var.role.label}}:" } }, [role, age]);
    const c = coder("freezer");
    await c.session();
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    const post = (variables: object) => c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    expect((await post({ role: value("student"), age: value(30) })).status).toBe(204);
    expect((await c.session()).frozen).toEqual([]);

    const unit = await c.next();
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(204);
    expect((await c.session()).frozen).toEqual(["role"]);
    // A change is ignored; one the loop doesn't depend on is stored
    expect((await post({ role: value("expert"), age: value(31) })).status).toBe(204);
    expect((await c.session()).variables).toMatchObject({ role: value("student"), age: value(31) });
  });
});

describe("response times", () => {
  it("store the browser's timing per answer, and when the server first handed out the unit", async () => {
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    await redeploy({}, [age]);
    const c = coder("timed");
    await c.session();
    const timing = (ms: number) => ({ firstMs: ms, totalMs: ms + 500, hiddenMs: 0, edits: 1 });
    const value = (v: number) => ({ done: true, skip: false, values: [{ value: v }] });
    const post = (body: object) => c.call("/variables/coder", { method: "POST", body: JSON.stringify(body) });
    expect((await post({ variables: { age: value(30) }, timings: { age: timing(2000) } })).status).toBe(204);
    // Looked at again, not changed: only the timing is updated
    expect((await post({ variables: { age: value(30) }, timings: { age: timing(3000) } })).status).toBe(204);

    const unit = await c.next();
    expect((await c.call("/variables/unit", {
      method: "POST",
      body: JSON.stringify({ unitId: unit!.id, variables: sentiment("positive"), timings: { sentiment: timing(4000), other: timing(1) } }),
    })).status).toBe(204);

    const page = (await (await server.request("/job/1/annotations", { headers: adminHeaders })).json()) as {
      annotations: { unitId: number | null; variable: string; timing: unknown; servedAt: string | null }[];
    };
    const byVariable = Object.fromEntries(page.annotations.map((a) => [a.variable, a]));
    expect(byVariable.age).toMatchObject({ timing: timing(3000), servedAt: null });
    expect(byVariable.sentiment).toMatchObject({ timing: timing(4000), servedAt: expect.any(String) });
    expect(byVariable.other).toBeUndefined();
    // A bad timing is refused
    expect((await post({ variables: { age: value(30) }, timings: { age: { firstMs: -1, totalMs: 0, hiddenMs: 0, edits: 0 } } })).status).toBe(400);
  });
});

describe("limits", () => {
  it("a job past its owner's limit on coders takes no new ones; existing coders go on", async () => {
    const first = coder("first");
    await first.session();
    const owner = await ensureUser(db, "owner@uni.nl");
    await db.query("UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify({ codersPerJob: 1 }), owner.id]);
    await db.query("UPDATE jobs SET owner_id = $1 WHERE id = 1", [owner.id]);
    const refused = await coder("second").call("/session");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "job_full" });
    expect((await first.call("/session")).status).toBe(200);
  });
});

describe("coder login", () => {
  /** A device logged in as this email (the researcher login's session cookie). */
  async function loggedIn(device: string, email: string) {
    const user = await ensureUser(db, email);
    devices.set(device, { cookies: new Map([["annotinder_session", await createSession(db, user.id)]]), invite: null });
  }
  const session = async (device: string, secret: string | null) => {
    const res = await send(device, "/session", {}, secret ? { "x-invite-secret": secret } : {});
    return { status: res.status, body: (await res.json()) as SessionResponse & { code?: string } };
  };

  it("an invite that requires login: the email is linked once; another device finds the session by logging in", async () => {
    const secret = await invite({ auth: "required" });
    expect(await session("anonymous", secret)).toMatchObject({ status: 401, body: { code: "auth_required" } });

    await loggedIn("phone", "a@example.org");
    const phone = await session("phone", secret);
    expect(phone).toMatchObject({ status: 200, body: { login: "a@example.org", canLogIn: false } });
    expect(devices.get("phone")!.cookies.has("annotinder_device")).toBe(true);
    // After that the device cookie alone is the session: logging out doesn't matter
    devices.get("phone")!.cookies.delete("annotinder_session");
    expect((await session("phone", secret)).body.coderId).toBe(phone.body.coderId);

    // Another device, without the link: the login finds the session, and the device joins it
    await loggedIn("laptop", "A@example.org");
    expect((await session("laptop", null)).body.coderId).toBe(phone.body.coderId);
    devices.get("laptop")!.cookies.delete("annotinder_session");
    expect((await session("laptop", null)).body.coderId).toBe(phone.body.coderId);
    // A transfer link works too
    expect((await send("phone", "/transfer", { method: "POST" })).status).toBe(200);

    const coders = (await (await server.request("/job/1/coders", { headers: adminHeaders })).json()) as CoderProgress[];
    expect(coders.find((c) => c.id === phone.body.coderId)?.email).toBe("a@example.org");
  });

  it("an email list: only those logins", async () => {
    const secret = await invite({ emails: ["b@example.org"] });
    expect(await session("nobody", secret)).toMatchObject({ status: 401, body: { code: "auth_required" } });
    await loggedIn("other", "a@example.org");
    expect(await session("other", secret)).toMatchObject({ status: 403, body: { code: "email_not_invited" } });
    await loggedIn("invited", "b@example.org");
    expect((await session("invited", secret)).status).toBe(200);
  });

  it("an optional login: links the email to the session started on the device; invites without login ignore it", async () => {
    const secret = await invite({ auth: "optional" });
    const before = await session("tablet", secret);
    expect(before.body.login).toBeNull();
    const user = await ensureUser(db, "c@example.org");
    devices.get("tablet")!.cookies.set("annotinder_session", await createSession(db, user.id));
    const after = await session("tablet", secret);
    expect(after.body).toMatchObject({ coderId: before.body.coderId, login: "c@example.org" });
    await loggedIn("desktop", "c@example.org");
    expect((await session("desktop", secret)).body.coderId).toBe(before.body.coderId);

    // One session per email in a job: a device that started its own, then logs in, continues the email's session
    const own = await session("phone", secret);
    expect(own.body.coderId).not.toBe(before.body.coderId);
    const phoneUser = await ensureUser(db, "c@example.org");
    devices.get("phone")!.cookies.set("annotinder_session", await createSession(db, phoneUser.id));
    expect((await session("phone", secret)).body.coderId).toBe(before.body.coderId);

    // The demo invite takes no logins: an anonymous session as always
    await loggedIn("researcher", "c@example.org");
    expect((await session("researcher", "demo-secret")).body).toMatchObject({ login: null });
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
    await redeploy({}, [sessionItem({ participant: { param: "participant" } })]);
    const secret = "demo-secret";
    const link = { "x-invite-secret": secret, "x-url-params": "participant=P123" };

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

    // A revoked invite starts no new sessions, also not for a known participant; existing ones go on.
    await db.query("UPDATE invites SET revoked_at = now() WHERE secret = $1", [secret]);
    expect((await send("device-3", "/session", {}, { ...link, "x-new-session": "1" })).status).toBe(401);
    expect((await send("device-2", "/session", {}, link)).status).toBe(200);
  });

  it("refuses invites that require login (not supported yet)", async () => {
    const secret = await invite({ auth: "required" });
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

    await redeploy({ units: [{ mode: "all" }] }); // v2: only `sentiment`
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
    const again = await c.call(`/loop/1/units/${first!.id}`);
    expect(again.status).toBe(200);
    expect(((await again.json()) as CoderUnitResponse).variables.sentiment.values).toEqual([{ value: "positive" }]);

    const unit3 = (await unitByExternalId("unit-3")).id;
    expect((await c.call(`/loop/1/units/${unit3}`)).status).toBe(404);
  });

  it("keeps answers to questions a codebook update removed, and tags the codebook version", async () => {
    // demo codebook: sentiment + actors_and_issues + other loop questions
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: [{ mode: "all" }] }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(204);

    const [stored] = await dbAnnotations();
    expect(stored.variables.sentiment.values).toEqual([{ value: "positive" }]);
    expect(stored.variables).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    const sentimentRows = await db.query(`SELECT codebook_id AS "codebookId" FROM annotation_values WHERE variable = 'sentiment'`);
    expect(sentimentRows).toEqual([{ codebookId: 2 }]);
  });
});

describe("rebuilding from the database", () => {
  const agreeing = {
    units: [{ mode: "shared", until: { agree: 2, on: "sentiment" }, maxCoders: 3 }],
  };
  const status = async () =>
    (await (await server.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;

  it("keeps saturation the same across a restart with an agreement rule", async () => {
    await redeploy({
      units: [{ mode: "shared", until: { agree: 2, on: "sentiment" }, maxCoders: 3, priority: "saturate" }],
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
    await redeploy({ units: [{ mode: "all" }] }); // v2: only `sentiment`

    server = restart();
    const again = coder("upd", null);
    expect((await again.submit(unit!.id, sentiment("positive"))).status).toBe(204);
    expect((await dbAnnotations())[0].variables).toHaveProperty("actors_and_issues");
  });

  it("keeps codings across a redeploy that keeps the loops, and derives them again when they change", async () => {
    const codings = () => db.query<{ agreement: Record<string, string> }>("SELECT agreement FROM unit_codings");

    // v2 changes the loop's questions (demo had six): finished units must be derived again
    await redeploy({ units: [{ mode: "all" }] });
    const c = coder("re");
    await c.submit((await c.next())!.id, sentiment("neutral"));
    expect(await codings()).toEqual([{ agreement: {} }]);

    // v3, same loop: kept
    await redeploy({ units: [{ mode: "all" }] });
    expect((await c.next())?.externalId).toBe("unit-2");

    // v4 adds an agreement rule: the codings are derived again, with its answers (also with two processes)
    await redeploy(agreeing);
    const other = restart();
    await Promise.all([c.session(), coder("re", null, () => other).session()]);
    expect(await codings()).toEqual([{ agreement: { sentiment: expect.any(String) } }]);
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
    variable: { type: "nominal", question: "?", options: [{ value: "yes" }, { value: "no" }] },
  };
  const fixedMain = { units: [{ mode: "all" }] };

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
    expect(again!.variables.sentiment.values).toEqual([{ value: "positive" }]);
    await c.submit(unit!.id, { ...sentiment("positive"), relevance: { done: true, values: [{ value: "yes" }] } });
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
      label: "second_loop",
      layout: { template: "" },
      units: [{ mode: "all" }],
      children: [relevance],
    };
    await redeploy(fixedMain, [second]);
    const c = coder("two");
    // Loops are numbered by position: second_loop (first in the codebook) is 1, main_loop 2.
    const unit = await c.next("2");
    expect((await c.submit(unit!.id, sentiment("neutral"), "2")).status).toBe(204);

    // finished in main_loop, not in second_loop
    expect((await c.next("2"))!.id).not.toBe(unit!.id);
    expect((await c.next("1"))!.id).toBe(unit!.id);
    const progress = Object.fromEntries((await c.session()).progress.map((p) => [p.unitset, p.doneUnitIds]));
    expect(progress).toEqual({ 1: [], 2: [unit!.id] });
  });
});

describe("state in the database, not in memory", () => {
  it("keeps no units: a unit changed after it was served is served as it is now", async () => {
    const c = coder("units");
    const unit = (await c.next())!;
    await c.submit(unit.id, demo("neutral"));
    await db.query("UPDATE units SET data = $1 WHERE id = $2", [JSON.stringify({ text: "fixed" }), unit.id]);
    const back = ((await (await c.call(`/loop/1/units/${unit.id}`)).json()) as CoderUnitResponse).data;
    expect(back).toEqual({ text: "fixed" });
  });

  it("works across server processes: changes, sessions and transfer links are in the database", async () => {
    const c = coder("two-servers");
    await c.session();
    const other = restart(); // a second process on the same database, running alongside
    const first = server;
    // A transfer link made on one process is redeemed on the other
    const { token } = (await (await c.call("/transfer", { method: "POST" })).json()) as { token: string };
    const phone = coder("phone", null, () => other);
    expect((await phone.call("/transfer/redeem", { method: "POST", body: JSON.stringify({ token }) })).status).toBe(200);
    expect((await phone.session()).coderId).toBe((await c.session()).coderId);
    // Pausing the job on one process is seen at once by the other
    server = other;
    const deployment = (await (await server.request("/job/1/deployment", { headers: adminHeaders })).json()) as { codebookId: number };
    await server.request("/job/1/deployment", { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId: deployment.codebookId, active: false }) });
    server = first;
    expect((await c.call("/loop/1/next")).status).toBe(409);
  });

  it("hands out a shared queue's units once, also when two processes are asked at the same time", async () => {
    await createSet("pair", ["unit-1", "unit-2"]);
    await redeploy({ units: [{ mode: "shared", set: { group: "g", set: "pair" }, until: { coders: 1 }, maxCoders: 1 }] });
    const other = restart();
    const [a, b] = await Promise.all([coder("left").next(), coder("right", "demo-secret", () => other).next()]);
    expect(new Set([a!.id, b!.id]).size).toBe(2);
    expect(await db.query("SELECT count(*)::int AS n FROM unit_leases")).toEqual([{ n: 2 }]);
  });

  it("hands out units in batches: the same unfinished ones first, then the next", async () => {
    const c = coder("batcher");
    const first = await c.batch(2);
    expect(first.map((u) => u.externalId)).toEqual(["unit-1", "unit-2"]);
    expect((await c.batch(2)).map((u) => u.externalId)).toEqual(["unit-1", "unit-2"]); // asked again: the same
    await c.submit(first[0].id, demo("neutral"));
    expect((await c.batch(2)).map((u) => u.externalId)).toEqual(["unit-2", "unit-3"]);
  });

  it("leases a batch of a shared queue: other coders get what is left first", async () => {
    await createSet("queue", ["unit-1", "unit-2", "unit-3"]);
    await redeploy({ units: [{ mode: "shared", set: { group: "g", set: "queue" }, until: { coders: 1 }, maxCoders: 1 }] });
    const a = coder("a-batch");
    const b = coder("b-batch");
    const held = await a.batch(2);
    expect(held).toHaveLength(2);
    // the other coder gets what is left first (leased units are taken)
    expect((await b.next())!.externalId).toBe("unit-3");
    // a submits from the batch, in any order
    expect((await a.submit(held[1].id, sentiment("positive"))).status).toBe(204);
    expect((await a.submit(held[0].id, sentiment("positive"))).status).toBe(204);
  });

  it("forgets idle deployments, and reads them again when used", async () => {
    let now = Date.now();
    server = restart({ now: () => now });
    const c = coder("idle");
    await c.submit((await c.next())!.id, demo("neutral"));
    storeCalls = [];
    now += 7 * 60 * 60_000; // past deploymentIdleMs: loaded afresh
    await c.session();
    expect(storeCalls).toContain("getDeployment");
  });
});

describe("unit versions", () => {
  const versionOf = async (unitId: number) =>
    (
      await db.query<{ data: UnitData }>(
        `SELECT v.data FROM annotation_values a JOIN unit_versions v ON v.id = a.unit_version_id
         WHERE a.unit_id = $1 AND a.retired_at IS NULL LIMIT 1`,
        [unitId],
      )
    )[0]?.data;
  const upload = (units: object[], extra: object) =>
    server.request("/job/1/units", { method: "POST", headers: adminHeaders, body: JSON.stringify({ units, ...extra }) });

  it("records the version of a unit each coder saw, also when it changed after it was served", async () => {
    const c = coder("hash");
    const first = (await c.next())!;
    await c.submit(first.id, demo("neutral"));
    expect(await versionOf(first.id)).toEqual(first.data);

    const second = (await c.next())!;
    const [before] = await db.query<{ externalId: string; data: UnitData }>(`SELECT external_id AS "externalId", data FROM units WHERE id = $1`, [second.id]);
    // The researcher replaces it while the coder has it open (not coded yet).
    expect((await upload([{ externalId: before.externalId, data: { ...before.data, text: "edited" } }], { overwrite: true })).status).toBe(201);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(204);
    expect((await versionOf(second.id))?.text).toBe(before.data.text);
  });

  it("replaces a coded unit only when asked to; its answers keep the version their coder saw", async () => {
    const a = coder("a");
    const unit = (await a.next())!;
    await a.submit(unit.id, demo("neutral"));
    const [row] = await db.query<{ externalId: string; data: UnitData }>(`SELECT external_id AS "externalId", data FROM units WHERE id = $1`, [unit.id]);
    const edited = [{ externalId: row.externalId, data: { ...row.data, text: "edited" } }];

    expect((await upload(edited, { overwrite: true })).status).toBe(409);
    expect((await upload(edited, { overwrite: true, overwriteCoded: true })).status).toBe(201);
    // The next coder sees the new text; the first answer still has the old one.
    expect((await coder("b").next())!.data.text).toBe("edited");
    expect((await versionOf(unit.id))?.text).toBe(row.data.text);

    const page = (await (await server.request("/job/1/unit-versions", { headers: adminHeaders })).json()) as { versions: { unitId: number; data: UnitData }[] };
    expect(page.versions.filter((v) => v.unitId === unit.id).map((v) => v.data.text)).toEqual([row.data.text, "edited"]);
  });

  it("sends coders only the unit fields the codebook uses", async () => {
    await upload([{ externalId: "secret", data: { headline: "h", text: "t" } }], {});
    await redeploy({ layout: { template: "$unit.headline" } });
    const unit = (await coder("c").next())!;
    expect(Object.keys(unit.data)).toEqual(["headline"]);
  });
});

describe("researcher preview", () => {
  const draft = async (note: string) => {
    const res = await server.request("/job/1/codebook", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        note,
        items: [{ type: "unit_loop", label: "main_loop", layout: { template: "" }, children: [sentimentQuestion], units: [{ mode: "all" }] }],
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
    const unit = ((await (await call("/loop/1/next")).json()) as { units: CoderUnitResponse[] }).units[0];
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

describe("end items", () => {
  it("end the session: the outcome is stored, and nothing more is accepted", async () => {
    const c = coder("young");
    expect((await c.session()).ended).toBeNull();
    const end = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "screen_out_young" }) });
    expect(await end.json()).toEqual({ reopen: null }); // no going back after a screenout
    expect((await c.session()).ended).toMatchObject({ item: "screen_out_young", outcome: "screenout" });

    const next = await c.call("/loop/1/next");
    expect(next.status).toBe(409);
    expect(await next.json()).toMatchObject({ code: "session_ended" });
    const answers = await c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: {} }) });
    expect(answers.status).toBe(409);

    // Researchers see how the session ended.
    const coders = (await (await server.request("/job/1/coders", { headers: adminHeaders })).json()) as { ended: unknown }[];
    expect(coders[0].ended).toMatchObject({ item: "screen_out_young", outcome: "screenout" });
  });

  it("inside a unit loop: remember the unit; the closed session gets only what the end screen uses", async () => {
    // An end in the loop whose message uses a unit field and an answer
    await redeploy({
      layout: { template: "$unit.headline" },
      children: [sentimentQuestion, { type: "end", name: "done_here", outcome: "complete", message: "$unit.headline: $var.sentiment.label" }],
    });
    const c = coder("ender");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    const bogus = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "done_here", unit: { loop: "1", id: 999999 } }) });
    expect(bogus.status).toBe(400);
    const end = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "done_here", unit: { loop: "1", id: unit!.id } }) });
    expect(await end.json()).toEqual({ reopen: { until: expect.any(String) } });
    const session = await c.session();
    expect(session.ended).toMatchObject({ unit: { loop: "1", id: unit!.id } });
    expect(session.endValues).toEqual({
      variables: {},
      unit: { data: { headline: expect.any(String) }, variables: { sentiment: expect.anything() } },
    });
    expect((await c.call(`/loop/1/units/${unit!.id}`)).status).toBe(409);
  });

  it("finishing without an end item ends the session too; the coder can go back for 15 minutes", async () => {
    let now = Date.now();
    server = restart({ now: () => now });
    await redeploy({}, [{ type: "question", name: "age", variable: { type: "numeric", question: "Age?" } }]);
    const c = coder("finisher");
    expect((await c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: { age: { done: true, skip: false, values: [{ value: 30 }] } } }) })).status).toBe(204);
    expect(await (await c.call("/end", { method: "POST", body: "{}" })).json()).toMatchObject({ reopen: { until: expect.any(String) } });
    const closed = await c.session();
    expect(closed.ended).toMatchObject({ outcome: "complete" });
    expect(closed.variables).toEqual({}); // closed: none of their answers
    expect((await c.call("/reopen", { method: "POST" })).status).toBe(204);
    expect((await c.session()).variables).toMatchObject({ age: expect.anything() });

    await c.call("/end", { method: "POST", body: "{}" });
    now += 16 * 60 * 1000;
    expect((await c.session()).reopen).toBeNull();
    expect((await c.call("/reopen", { method: "POST" })).status).toBe(409);
  });

  it("a job can keep finished sessions open", async () => {
    await server.request("/job/1", { method: "PUT", headers: adminHeaders, body: JSON.stringify({ name: "Demo", keepSessionsOpen: true }) });
    await redeploy({});
    const c = coder("keeper");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    await c.call("/end", { method: "POST", body: "{}" });
    expect((await c.session()).reopen).toEqual({ until: null });
    expect((await c.call(`/loop/1/units/${unit!.id}`)).status).toBe(200);
  });

  it("only for end items of the codebook", async () => {
    const res = await coder("other").call("/end", { method: "POST", body: JSON.stringify({ item: "consent" }) });
    expect(res.status).toBe(400);
  });
});
