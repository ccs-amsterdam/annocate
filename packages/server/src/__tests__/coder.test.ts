import { beforeEach, describe, expect, it } from "vitest";
import type {
  CoderProgress,
  CoderUnitResponse,
  DeploymentResponse,
  DeploymentStatus,
  SessionResponse,
  PickNamesResponse,
  UnitData,
  VariableValue,
} from "@annotinder/contracts";
import { RELEASE, splitDesignItems } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { and, eq, isNull } from "drizzle-orm";
import { annotationValues, links as linksTable, units } from "../db/schema/index.js";
import { unitDraftData, unitVersionData } from "../db/sql.js";
import { emptyDb, query } from "./testDb.js";
import { seed } from "../seed.js";
import { createApp } from "../app.js";
import type { RuntimeOptions } from "../runtime/runtime.js";
import { DbStore, type Store } from "../runtime/store.js";
import { ensureUser } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";

/** A coder's login: a verified email, no second factor needed. */
const CODER_LOGIN = { mfa: false, authTime: null, issuer: "https://idp.test" };
import { SESSION_COOKIE } from "../researcher/login.js";

// End-to-end: client -> server -> database, through the app's fetch handler
// (no sockets). A new app on the same database is a restart.

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

let db: Db;
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

/**
 * A (re)started server on the same database: empty memory. Draws are
 * predictable: `random` is 0 (a balanced tie goes to the first value) unless
 * a test sets it.
 */
function restart(runtime: Partial<RuntimeOptions> = {}) {
  return createApp(db, {
    secret: "test-secret",
    runtime: { random: () => 0, ...runtime },
    wrapStore: recording,
    devMode: true,
  });
}

beforeEach(async () => {
  db = await emptyDb();
  await seed(db);
  server = restart();
  storeCalls = [];
  devices = new Map();
});

/**
 * Simulated browsers, by name: their cookies, and the link they were
 * opened with (a reload sends it again, like the client does from the URL).
 */
let devices = new Map<string, { cookies: Map<string, string>; linkSecret: string | null }>();

/** A request from a device: sends its cookies and the client header, keeps cookies it is given. */
async function send(
  name: string,
  path: string,
  init: RequestInit = {},
  headers: Record<string, string> = {},
  app = () => server,
) {
  let device = devices.get(name);
  if (!device) devices.set(name, (device = { cookies: new Map(), linkSecret: null }));
  const cookie = [...device.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await app().request(`/api/d/1${path}`, {
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

/** A coder on device `name`, opened with `link` (`null`: the link the device was opened with before, if any). */
function coder(name: string, linkSecret: string | null = "demo-secret", app = () => server) {
  if (!devices.has(name)) devices.set(name, { cookies: new Map(), linkSecret: null });
  const device = devices.get(name)!;
  if (linkSecret !== null) device.linkSecret = linkSecret;
  const call = (path: string, init?: RequestInit) =>
    send(name, path, init, device.linkSecret ? { "x-link-secret": device.linkSecret } : {}, app);
  return {
    session: async () => (await call("/session")).json() as Promise<SessionResponse>,
    next: async (loop = "1") => {
      const res = await call(`/loop/${loop}/next`);
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

/** A finished unit in the one-question design versions `redeploy` creates. */
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
  return (await query<{ id: number }>(db, "SELECT id FROM units WHERE external_id = $1", [externalId]))[0];
}

/** Live annotation values per (unit, coder), as stored in the database. */
/** Unit answers in the database, per unit and coder. */
async function dbAnnotations() {
  const rows = await query<{
    unitId: number;
    sessionId: number;
    variable: string;
    value: VariableValue;
    designVersionId: number;
  }>(
    db,
    `SELECT unit_id AS "unitId", session_id AS "sessionId", variable, value, design_version_id AS "designVersionId"
     FROM annotation_values WHERE unit_id IS NOT NULL AND retired_at IS NULL ORDER BY unit_id, session_id`,
  );
  const byUnit = new Map<
    string,
    { unitId: number; sessionId: number; variables: Record<string, VariableValue>; designVersionIds: number[] }
  >();
  for (const row of rows) {
    const key = `${row.unitId}/${row.sessionId}`;
    if (!byUnit.has(key))
      byUnit.set(key, { unitId: row.unitId, sessionId: row.sessionId, variables: {}, designVersionIds: [] });
    byUnit.get(key)!.variables[row.variable] = row.value;
    byUnit.get(key)!.designVersionIds.push(row.designVersionId);
  }
  return [...byUnit.values()];
}

describe("coder flow", () => {
  it("serves the session and units, and stores annotations", async () => {
    const c = coder("coder-a");
    const session = await c.session();
    expect(session.studyId).toBe(1);
    // The coder codebook: no researcher notes, and loops without how units are handed out
    expect(session.codebook).not.toHaveProperty("note");
    const loop = session.codebook.items.find((i) => i.type === "unit_loop");
    expect(loop?.type === "unit_loop" && !("units" in loop)).toBe(true);

    const first = await c.next();
    expect(first?.externalId).toBe("unit-1");
    expect(first?.data.headline).toBeTypeOf("string");

    expect((await c.submit(first!.id, demo("positive"))).status).toBe(200);
    expect(await dbAnnotations()).toHaveLength(1);
    expect((await dbAnnotations())[0].variables.sentiment.values).toEqual([{ value: "positive" }]);

    expect((await c.next())?.externalId).toBe("unit-2");
    expect((await c.session()).progress).toEqual([{ set: "1", doneUnitIds: [first!.id], totalUnits: 3 }]);
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

  it("requires a valid link for new coders", async () => {
    // Link problems are 404 or 403 with a code; 401 only asks for a login (auth_required)
    const none = await coder("coder-x", null).call("/session");
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ code: "link_not_found" });
    const wrong = await coder("coder-x", "wrong").call("/session");
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toMatchObject({ code: "link_not_found" });
  });

  it("returns 404 for unknown or undeployed studies", async () => {
    const headers = { "x-annotinder": "1", "x-link-secret": "demo-secret" };
    expect((await server.request("/api/d/other/session", { headers })).status).toBe(404);
    expect((await server.request("/api/d/99/session", { headers })).status).toBe(404);
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

  it("skips units that were deleted (once that is deployed)", async () => {
    const unit3 = await unitByExternalId("unit-3");
    expect(
      (await server.request(`/api/study/1/units/${unit3.id}`, { method: "DELETE", headers: adminHeaders })).status,
    ).toBe(204);
    await deployDrafts();

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
  variable: {
    type: "nominal",
    question: "?",
    options: [{ value: "positive" }, { value: "negative" }, { value: "neutral" }],
  },
};

/**
 * Creates a design with the given unit_loop settings (by default with one
 * question, `sentiment`) and deploys it as a new version. Returns the
 * deployment response.
 */
async function redeploy(
  { layout, ...loop }: { layout?: object } & Record<string, unknown>,
  extraItems: object[] = [],
): Promise<DeploymentResponse> {
  const res = await server.request("/api/study/1/design", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      note: "v2",
      // A Session item among them goes into `session` (docs/architecture.md §6)
      ...splitDesignItems(
        withDivide([
          ...extraItems,
          {
            type: "unit_loop",
            label: "main_loop",
            units: {},
            // `layout`: the loop's layout item (first)
            children: [{ type: "layout", template: "", ...layout }, sentimentQuestion],
            ...loop,
          },
        ]),
      ),
    }),
  });
  expect(res.status).toBe(201);
  const codebook = (await res.json()) as { id: number };
  const deploy = await server.request("/api/study/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: codebook.id, units: true }),
  });
  expect(deploy.status).toBe(200);
  return (await deploy.json()) as DeploymentResponse;
}

/** Deploys the draft units and sets with the deployed design version (docs/architecture.md §8.4). */
async function deployDrafts(): Promise<DeploymentResponse> {
  const current = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
    designVersionId: number;
  };
  const res = await server.request("/api/study/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: current.designVersionId, units: true }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as DeploymentResponse;
}

/** A unit of the draft: its external id and data. */
async function draftUnit(id: number): Promise<{ externalId: string; data: UnitData }> {
  const [row] = await db
    .select({ externalId: units.externalId, data: unitDraftData(units.id) })
    .from(units)
    .where(eq(units.id, id));
  return row!;
}

/** Adds a set to a set column (`g` by default), replacing a set of that name. Returns its unit ids. */
async function createSet(name: string, externalIds: string[], group = "g") {
  const ids = await Promise.all(externalIds.map(async (e) => (await unitByExternalId(e)).id));
  const groups = (await (await server.request("/api/study/1/sets", { headers: adminHeaders })).json()) as {
    name: string;
    sets: { name: string }[];
  }[];
  const sets = (groups.find((g) => g.name === group)?.sets ?? []).filter((s) => s.name !== name);
  const res = await server.request(`/api/study/1/sets/${group}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ sets: [...sets, { name, unitIds: ids }] }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return ids;
}

/** The deployed design version's links: params -> secret. */
async function links(): Promise<
  { id: number; secret: string; params: Record<string, string>; retiredAt: string | null }[]
> {
  return (await (await server.request("/api/study/1/links", { headers: adminHeaders })).json()) as never;
}

let extraLinks = 0;
/** Another link to the study. Made directly: links come from the deployed design version, so a later deploy retires it. */
async function link() {
  const secret = `extra-${++extraLinks}`;
  await query(db, "INSERT INTO links (study_id, label, secret, link_key) VALUES (1, 'x', $1, $2)", [
    secret,
    JSON.stringify(["test", extraLinks]),
  ]);
  return secret;
}

/** The coder reached a computed item: its value. */
async function reach(c: ReturnType<typeof coder>, name: string) {
  const res = await c.call(`/variables/computed/${name}`, { method: "POST" });
  expect(res.status).toBe(200);
  return ((await res.json()) as { value: VariableValue }).value.values;
}

/** A Session item (contracts SessionItemSchema). */
const sessionItem = (extra: object) => ({ type: "session", ...extra });
/**
 * A crowd invitation (contracts CrowdInviteSchema); `divide`: the loops'
 * units are divided among the coders with these criteria (each loop's
 * `units.divide` unless it has its own, set by `redeploy`).
 */
const crowd = (divide?: object, extra: object = {}) =>
  sessionItem({ invite: { mode: "crowd", ...extra }, ...(divide ? { [DIVIDE]: divide } : {}) });
const DIVIDE = "__divide";

/** The items with a crowd's `divide` (`crowd`) in every unit loop without its own; top-level end items in a block. */
function withDivide(items: object[]): object[] {
  const session = items.find((i) => (i as { type?: string }).type === "session") as Record<string, unknown> | undefined;
  const divide = session?.[DIVIDE];
  return items.map((raw) => {
    const it = raw as { type?: string; units?: Record<string, unknown> } & Record<string, unknown>;
    if (it.type === "session") {
      const { [DIVIDE]: _divide, ...rest } = it;
      void _divide;
      return rest;
    }
    if (it.type === "end") return { type: "block", children: [it] };
    if (it.type === "unit_loop" && divide && !it.units?.divide && !it.units?.sameAsPrevious)
      return { ...it, units: { ...it.units, divide } };
    return it;
  });
}
/** Specific coders: the values of a set column, each with their own link (or signing in, `login`). */
const codersInvite = (column = "coder", link: "per_coder" | "login" = "per_coder") =>
  sessionItem({ invite: { mode: "coders", column, link } });

describe("shared queues", () => {
  it("pick up a redeploy and code each unit until coders agree", async () => {
    await coder("warmup").session(); // the server has the old version loaded
    await redeploy({}, [
      crowd({ until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 }, priority: "saturate" }),
    ]);

    const answers: Record<string, string> = { a: "positive", b: "negative", c: "positive" };
    const firstUnits: number[] = [];
    for (const key of ["a", "b", "c"]) {
      const c = coder(key);
      const unit = await c.next();
      firstUnits.push(unit!.id);
      expect((await c.submit(unit!.id, sentiment(answers[key]))).status).toBe(200);
    }
    // saturate: everyone gets the same unit until it reaches agreement (a and c agree on the 3rd coding)
    expect(new Set(firstUnits).size).toBe(1);

    const d = coder("d");
    const unit = await d.next();
    expect(unit!.id).not.toBe(firstUnits[0]);

    const status = (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;
    expect(status.version).toBe(2);
    expect(status.sources).toEqual([
      expect.objectContaining({
        loop: "main_loop",
        set: "all",
        mode: "dynamic",
        completeUnits: 1,
        leasedUnits: 1,
        codings: 3,
        coders: 4,
      }),
    ]);
  });

  it("divide each loop's units by its own rules: two coders per unit, or until two agree", async () => {
    const other = {
      type: "unit_loop",
      label: "other",
      units: { divide: { codersPerUnit: { min: 2, max: 2 }, priority: "saturate" } },
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({}, [
      crowd({ until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 }, priority: "saturate" }),
      other,
    ]);
    // Loop 1: a unit is done once 2 coders coded it
    const first: number[] = [];
    for (const key of ["a", "b"]) {
      const c = coder(key);
      const unit = await c.next("1");
      first.push(unit!.id);
      expect((await c.submit(unit!.id, { other: { done: true } }, "1")).status).toBe(200);
    }
    expect(new Set(first).size).toBe(1);
    expect((await coder("c").next("1"))!.id).not.toBe(first[0]);
    // Loop 2: two coders who disagree don't finish a unit
    const second: number[] = [];
    for (const [key, code] of [
      ["a", "positive"],
      ["b", "negative"],
    ]) {
      const c = coder(key);
      const unit = await c.next("2");
      second.push(unit!.id);
      expect((await c.submit(unit!.id, sentiment(code), "2")).status).toBe(200);
    }
    expect(new Set(second).size).toBe(1);
    expect((await coder("c").next("2"))!.id).toBe(second[0]);
  });

  it("a loop can take the units each coder got in the previous loop, in that order", async () => {
    const first = {
      type: "unit_loop",
      label: "first",
      units: { divide: { codersPerUnit: { min: 1, max: 1 }, unitsPerCoder: { max: 2 } } },
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({ units: { sameAsPrevious: true } }, [crowd(), first]);
    const a = coder("a");
    const got: number[] = [];
    for (let unit = await a.next("1"); unit; unit = await a.next("1")) {
      got.push(unit.id);
      expect((await a.submit(unit.id, { other: { done: true } }, "1")).status).toBe(200);
    }
    expect(got).toHaveLength(2);
    const again: number[] = [];
    for (let unit = await a.next("2"); unit; unit = await a.next("2")) {
      again.push(unit.id);
      expect((await a.submit(unit.id, sentiment("neutral"), "2")).status).toBe(200);
    }
    expect(again).toEqual(got);
    // Another coder got other units in loop 1, and gets those again
    const b = coder("b");
    const bFirst = await b.next("1");
    expect(got).not.toContain(bFirst!.id);
    expect((await b.submit(bFirst!.id, { other: { done: true } }, "1")).status).toBe(200);
    expect((await b.next("2"))!.id).toBe(bFirst!.id);
    // The status: one row for the loop, whatever the number of coders
    const status = (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;
    expect(status.sources.filter((s) => s.loop === "main_loop").map((s) => [s.set, s.coders])).toEqual([["as 1", 2]]);
  });

  it("refuse annotations for units that were not handed to the coder", async () => {
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
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
    server = createApp(db, { secret: "test-secret", wrapStore: racing, devMode: true });
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
    const a = coder("a");
    const unitA = (await a.next())!;
    const { sessionId } = await a.session();
    between = (store) =>
      store.putAnnotation({
        unitId: unitA.id,
        sessionId,
        variables: { sentiment: { done: true, skip: false, values: [{ value: "neutral" }] } },
        codings: [{ loop: "1", agreement: {} }],
      });
    const unitB = await coder("b").next();
    expect(between).toBeNull();
    expect(unitB?.id).not.toBe(unitA.id);
  });

  it("requests at once are picked together, as if one after the other; a coder asking twice gets the same unit", async () => {
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
    const names = ["a", "b", "c"];
    for (const name of names) await coder(name).session();
    const units = await Promise.all([...names, "a"].map((name) => coder(name).next()));
    const [a, b, c, aAgain] = units.map((u) => u?.id);
    // One coder per unit: every coder a unit of their own
    expect(new Set([a, b, c]).size).toBe(3);
    expect(aAgain).toBe(a);
  });
});

describe("coders", () => {
  const coders = codersInvite();
  /** The units a coder gets, finishing each. */
  const order = async (c: ReturnType<typeof coder>, loop = "1") => {
    const seen: string[] = [];
    for (let u = await c.next(loop); u; u = await c.next(loop)) {
      seen.push(u.externalId);
      await c.submit(u.id, sentiment("positive"));
    }
    return seen;
  };

  it("by link: a link per coder, who gets the units whose cell holds them, and the column's overlap", async () => {
    await createSet("anna", ["unit-1"], "coder");
    await createSet("bob", ["unit-2", "unit-1"], "coder"); // unit-1: anna;bob
    await createSet("_overlap", ["unit-3"], "coder");
    const deployed = await redeploy({ units: { overlap: "before" } }, [coders]);
    expect(deployed.links).toBe(2);
    const byCoder = Object.fromEntries(
      (await links()).filter((l) => !l.retiredAt).map((l) => [l.params.coder, l.secret]),
    );
    expect(Object.keys(byCoder).sort()).toEqual(["anna", "bob"]);
    const anna = coder("anna", byCoder.anna);
    expect((await anna.session()).session).toEqual({ coder: "anna" });
    expect(await order(anna)).toEqual(["unit-3", "unit-1"]);
    expect(await order(coder("bob", byCoder.bob))).toEqual(["unit-3", "unit-1", "unit-2"]);
    // The link's coder is the session's coder: anna's link on another device asks first, then anna's units again
    const elsewhere = await send("anna-2", "/session", {}, { "x-link-secret": byCoder.anna });
    expect(await elsewhere.json()).toMatchObject({ code: "coder_has_session" });
    await send("anna-2", "/session", {}, { "x-link-secret": byCoder.anna, "x-new-session": "1" });
    expect(await order(coder("anna-2", byCoder.anna))).toEqual(["unit-3", "unit-1"]);

    // A new coder: a new link once deployed. Removing bob retires his link; his session goes on.
    await createSet("carol", ["unit-3"], "coder");
    expect((await deployDrafts()).links).toBe(3);
    const ids = async (names: string[]) => Promise.all(names.map(async (n) => (await unitByExternalId(n)).id));
    await server.request("/api/study/1/sets/coder", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        sets: [
          { name: "anna", unitIds: await ids(["unit-1"]) },
          { name: "carol", unitIds: await ids(["unit-3"]) },
        ],
      }),
    });
    await deployDrafts();
    const retired = await send("late", "/session", {}, { "x-link-secret": byCoder.bob });
    expect(retired.status).toBe(403);
    expect(await retired.json()).toMatchObject({ code: "link_inactive" });
    // The demo link (no coders before) is retired too: the design makes a link per coder now
    expect((await send("demo", "/session", {}, { "x-link-secret": "demo-secret" })).status).toBe(403);
    // A set column the design uses can't be deleted
    expect((await server.request("/api/study/1/sets/coder", { method: "DELETE", headers: adminHeaders })).status).toBe(
      409,
    );
  });

  it("by email address: one link, coders sign in, only those addresses", async () => {
    await createSet("a@example.org", ["unit-1"], "coder");
    await createSet("b@example.org", ["unit-2"], "coder");
    expect((await redeploy({}, [codersInvite("coder", "login")])).links).toBe(1);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    expect(await (await send("anon", "/session", {}, { "x-link-secret": secret })).json()).toMatchObject({
      code: "auth_required",
    });
    const login = async (device: string, email: string) => {
      const user = await ensureUser(db, email);
      devices.set(device, {
        cookies: new Map([["annotinder_session", await createSession(db, user.id, CODER_LOGIN)]]),
        linkSecret: null,
      });
    };
    await login("stranger", "c@example.org");
    expect(await (await send("stranger", "/session", {}, { "x-link-secret": secret })).json()).toMatchObject({
      code: "email_not_allowed",
    });
    await login("b", "B@example.org");
    const b = coder("b", secret);
    expect((await b.session()).session).toEqual({ coder: "b@example.org" });
    expect(await order(b)).toEqual(["unit-2"]);
  });

  it("by name: one link, coders pick their name; a name is the first device's, or (any) shared by devices", async () => {
    await createSet("anna", ["unit-1"], "coder");
    await createSet("bob", ["unit-2"], "coder");
    await redeploy({}, [sessionItem({ invite: { mode: "coders", column: "coder", link: "pick_name" } })]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const names = async () =>
      (await (
        await server.request("/api/d/1/names", { headers: { "x-annotinder": "1", "x-link-secret": secret } })
      ).json()) as PickNamesResponse;
    expect(await names()).toEqual({
      names: [
        { name: "anna", taken: false },
        { name: "bob", taken: false },
      ],
    });
    const start = (device: string, name?: string) =>
      send(device, "/session", {}, { "x-link-secret": secret, ...(name ? { "x-coder-name": name } : {}) });
    expect(await (await start("p1")).json()).toMatchObject({ code: "name_required" });
    expect(await (await start("p1", "carol")).json()).toMatchObject({ code: "name_required" });
    const anna = (await (await start("p1", "anna")).json()) as SessionResponse;
    expect(anna.session).toEqual({ coder: "anna" });
    expect(await order(coder("p1", secret))).toEqual(["unit-1"]);
    expect((await names()).names).toContainEqual({ name: "anna", taken: true });
    // Another device can't pick anna; the first device keeps its session
    const refused = await start("p2", "anna");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "name_taken" });
    expect(((await (await start("p1")).json()) as SessionResponse).sessionId).toBe(anna.sessionId);

    // Shared by devices: picking a name continues its session
    await redeploy({}, [
      sessionItem({ invite: { mode: "coders", column: "coder", link: "pick_name", nameDevices: "any" } }),
    ]);
    const shared = (await (await start("p3", "anna")).json()) as SessionResponse;
    expect(shared.sessionId).toBe(anna.sessionId);
    expect((await names()).names.every((n) => !n.taken)).toBe(true);

    // A trusted team's feature: email addresses can be names too
    await createSet("c@example.org", ["unit-3"], "coder");
    await deployDrafts();
    expect((await names()).names.map((n) => n.name)).toContain("c@example.org");

    // A revoked link lists no names
    await db.update(linksTable).set({ revokedAt: new Date() }).where(eq(linksTable.secret, secret));
    const revoked = await server.request("/api/d/1/names", {
      headers: { "x-annotinder": "1", "x-link-secret": secret },
    });
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ code: "link_revoked" });
  });

  it("signing in needs email addresses, and the column must be a set column", async () => {
    await createSet("anna", ["unit-1"], "coder");
    await createSet("b@example.org", ["unit-2"], "coder");
    const design = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(
        splitDesignItems([
          codersInvite("coder", "login"),
          { type: "unit_loop", units: {}, children: [{ type: "layout", template: "" }, sentimentQuestion] },
        ]),
      ),
    });
    const { id } = (await design.json()) as { id: number };
    const deploy = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: id, units: true }),
    });
    expect(deploy.status).toBe(400);
    expect(await deploy.json()).toMatchObject({
      code: "assignment_invalid",
      error: expect.stringContaining("aren't all email addresses"),
    });
    // A text field can't be a set column
    expect(
      (
        await server.request("/api/study/1/sets/text", {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify({ sets: [] }),
        })
      ).status,
    ).toBe(409);
  });

  it("no units yet: none, until the next deploy brings them, as it brings new units", async () => {
    await createSet("anna", [], "coder");
    await redeploy({}, [coders]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const anna = coder("anna", secret);
    expect(await anna.next()).toBeNull();
    const set = await createSet("anna", ["unit-2"], "coder");
    expect(await anna.next()).toBeNull();
    const deployed = await deployDrafts();
    expect((await anna.next())!.id).toBe(set[0]);
    // A new version that changed the units, not the design
    const versions = (await (
      await server.request("/api/study/1/deployment/versions", { headers: adminHeaders })
    ).json()) as { version: number; changes: unknown }[];
    expect(versions[0]).toMatchObject({
      version: deployed.version,
      changes: { design: false, units: { added: 0, changed: 0, removed: 0, sets: true } },
    });
    // With the release (and commit) it ran on
    expect(versions[0]).toMatchObject({ client: { release: RELEASE, commit: expect.any(String) } });

    // Without coders: every unit; new units join with the next deploy
    await redeploy({});
    const c = coder("all");
    await order(c);
    const { data: before } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "unit-new", data: { ...before, text: "New" } }] }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    const pending = (await (
      await server.request("/api/study/1/deployment/pending", { headers: adminHeaders })
    ).json()) as { units: object };
    expect(pending.units).toEqual({ added: 1, changed: 0, removed: 0, sets: false });
    expect(await c.next()).toBeNull();
    await deployDrafts();
    expect((await c.next())!.externalId).toBe("unit-new");
  });
});

describe("computed items linked to a column", () => {
  const part = { type: "computed", name: "part", variable: { type: "random", draw: "balanced", units: "parts" } };

  it("draw from the column's values when reached, or when a loop after them needs them", async () => {
    await createSet("p1", ["unit-1"], "parts");
    await createSet("p2", ["unit-2"], "parts");
    await redeploy({}, [part]);
    const a = coder("a");
    expect(await reach(a, "part")).toEqual([{ value: "p1" }]);
    expect((await a.session()).session).toMatchObject({ part: "p1" });
    expect((await a.next())!.externalId).toBe("unit-1");
    // b never reached it (e.g. it was hidden): assigned when the loop needs it
    const b = coder("b");
    expect((await b.next())!.externalId).toBe("unit-2");
    expect((await b.session()).variables.part).toMatchObject({ values: [{ value: "p2" }] });
  });

  it("don't select the units of loops before them", async () => {
    await createSet("p1", ["unit-1"], "parts");
    const loopBefore = {
      type: "unit_loop",
      label: "before",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({}, [loopBefore, part]);
    const a = coder("a");
    const first = (await a.batch(10, "1")).map((u) => u.externalId);
    expect(first.length).toBeGreaterThan(1);
    expect((await a.batch(10, "2")).map((u) => u.externalId)).toEqual(["unit-1"]);
  });
});

describe("assignment edge cases (review of the unit assignment)", () => {
  const login = async (device: string, email: string) => {
    const user = await ensureUser(db, email);
    devices.set(device, {
      cookies: new Map([["annotinder_session", await createSession(db, user.id, CODER_LOGIN)]]),
      linkSecret: null,
    });
  };

  it("a shared queue counts leases across shares: a unit in two of them goes to one coder only", async () => {
    // unit-1 is `a;b`: in both shares
    await createSet("a", ["unit-1", "unit-2"], "framing");
    await createSet("b", ["unit-1", "unit-3"], "framing");
    const framing = {
      type: "computed",
      name: "framing",
      variable: { type: "random", draw: "balanced", units: "framing" },
    };
    await redeploy({}, [crowd({ codersPerUnit: { max: 1 } }), framing]);
    const x = coder("x");
    const y = coder("y");
    const values = [...(await reach(x, "framing")), ...(await reach(y, "framing"))].map((v) => v.value).sort();
    expect(values).toEqual(["a", "b"]);
    // unit-1 comes first in both shares: at once, only one coder gets it (the other gets their own unit)
    const [ux, uy] = await Promise.all([x.next(), y.next()]);
    expect([ux!.externalId, uy!.externalId].filter((id) => id === "unit-1")).toHaveLength(1);
    const status = (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;
    expect(status.sources.reduce((n, s) => n + s.totalUnits, 0)).toBe(3);
    expect(status.sources.reduce((n, s) => n + s.leasedUnits, 0)).toBe(2);
  });

  it("loops with the same columns and subset but another overlap count each get their own", async () => {
    await createSet("_overlap", ["unit-1", "unit-2", "unit-3"]);
    const first = {
      type: "unit_loop",
      label: "first",
      units: { overlap: "ignore" },
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({ units: { overlap: "before" } }, [crowd(undefined, { column: "g" }), first]);
    const c = coder("c");
    // Loop 2 first: the order in which a server computes them doesn't matter
    const second = (await c.batch(20, "2")).length;
    const one = (await c.batch(20, "1")).length;
    expect(second - one).toBe(3);
  });

  it("hands out the same unfinished unit again, and marks each loop the coder reached", async () => {
    const before = {
      type: "unit_loop",
      label: "before",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({ units: { overlap: "ignore" } }, [before]);
    const c = coder("c");
    const first = await c.next("2");
    expect((await c.next("2"))!.id).toBe(first!.id);
    expect(await c.next("1")).not.toBeNull();
    const { sessionId } = await c.session();
    const [stored] = await query<{ assignments: Record<string, unknown> }>(
      db,
      "SELECT assignments FROM coder_sessions WHERE id = $1",
      [sessionId],
    );
    expect(stored.assignments).toEqual({ "1": { at: expect.any(Number) }, "2": { at: expect.any(Number) } });
    // The units follow from the session: no branch to choose (an old client's `branch` is ignored)
    expect((await c.call("/loop/2/next?branch=3")).status).toBe(200);
  });

  it("a computed value drawn twice at once has one value, in the answers and the session", async () => {
    await createSet("p1", ["unit-1"], "parts");
    await createSet("p2", ["unit-2"], "parts");
    const part = { type: "computed", name: "part", variable: { type: "random", draw: "random", units: "parts" } };
    await redeploy({}, [part]);
    // Routing draws p1 (random() = 0); just after it found no value, another request of this coder drew p2
    let between: ((store: Store) => Promise<void>) | null = null;
    const racing = (store: Store): Store =>
      new Proxy(store, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== "function") return value;
          if (prop === "locked")
            return (key: string, fn: (s: Store) => Promise<unknown>) => target.locked(key, (s) => fn(racing(s)));
          return async (...args: unknown[]) => {
            const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
            const finish = between;
            if (finish && prop === "coderValues") {
              between = null;
              await finish(target);
            }
            return result;
          };
        },
      });
    server = createApp(db, { secret: "test-secret", runtime: { random: () => 0 }, wrapStore: racing, devMode: true });
    const c = coder("c");
    const { sessionId } = await c.session();
    between = async (store) => {
      await store.putCoderValues({
        sessionId,
        values: { part: { done: true, skip: false, values: [{ value: "p2" }] } },
        assigned: true,
        designVersionId: null,
      });
      await store.setSessionValue(sessionId, "part", "p2");
    };
    const unit = await c.next();
    expect(between).toBeNull();
    const session = await c.session();
    expect(session.session.part).toBe("p2");
    expect(session.variables.part.values).toEqual([{ value: "p2" }]);
    expect(unit!.externalId).toBe("unit-2");
  });

  it("coders keep the units they coded when the column changes; the new coder gets them too", async () => {
    await createSet("anna", ["unit-1"], "coder");
    await createSet("bob", ["unit-2"], "coder");
    await redeploy({}, [codersInvite()]);
    const byCoder = Object.fromEntries(
      (await links()).filter((l) => !l.retiredAt).map((l) => [l.params.coder, l.secret]),
    );
    const anna = coder("anna", byCoder.anna);
    const unit1 = await anna.next();
    expect((await anna.submit(unit1!.id, sentiment("positive"))).status).toBe(200);
    // unit-1 moves from anna to bob
    await createSet("anna", ["unit-3"], "coder");
    await createSet("bob", ["unit-2", "unit-1"], "coder");
    await deployDrafts();
    expect((await anna.call(`/loop/1/units/${unit1!.id}`)).status).toBe(200);
    expect((await anna.submit(unit1!.id, sentiment("negative"))).status).toBe(200);
    const bob = coder("bob", byCoder.bob);
    const bobs = (await bob.batch(10)).map((u) => u.externalId);
    expect(bobs).toContain("unit-1");
  });

  it("with coders, the overlap of a computed item's column is in every share, not an overlap to place", async () => {
    await createSet("anna", ["unit-1", "unit-2"], "coder");
    await createSet("a", ["unit-3"], "framing");
    await createSet("_overlap", ["unit-1", "unit-2"], "framing");
    const framing = {
      type: "computed",
      name: "framing",
      variable: { type: "random", draw: "balanced", units: "framing" },
    };
    await redeploy({ units: { overlap: "before" } }, [codersInvite(), framing]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    expect((await coder("anna", secret).batch(10)).map((u) => u.externalId).sort()).toEqual(["unit-1", "unit-2"]);
    // Nor in the coders' progress
    const [progress] = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    expect(progress.special).toEqual({});
  });

  it("an email coder asking for a new session continues their own", async () => {
    await createSet("a@example.org", ["unit-1"], "coder");
    await redeploy({}, [codersInvite("coder", "login")]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    await login("a", "a@example.org");
    const first = (await (await send("a", "/session", {}, { "x-link-secret": secret })).json()) as SessionResponse;
    const again = (await (
      await send("a", "/session", {}, { "x-link-secret": secret, "x-new-session": "1" })
    ).json()) as SessionResponse;
    expect(again.sessionId).toBe(first.sessionId);
  });

  it("a session without a coder value is told it has no units yet", async () => {
    const early = coder("early");
    await early.session();
    await createSet("anna", ["unit-1"], "coder");
    await redeploy({}, [codersInvite()]);
    const res = await early.call("/loop/1/next");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "not_assigned" });
  });
});

describe("loop subsets and the overlap", () => {
  const coders = codersInvite("g");
  const order = async (name: string) => {
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    // The link's coder (s1) on another device each time: a new session
    await send(name, "/session", {}, { "x-link-secret": secret, "x-new-session": "1" });
    const c = coder(name, secret);
    const seen: string[] = [];
    for (let u = await c.next(); u; u = await c.next()) {
      seen.push(u.externalId);
      await c.submit(u.id, sentiment("positive"));
    }
    return seen;
  };

  it("hands out the overlap before, after or spread through the coder's own units, or not at all", async () => {
    await createSet("s1", ["unit-1", "unit-2"]);
    await createSet("_overlap", ["unit-2", "unit-3"]);
    await redeploy({ units: { overlap: "before" } }, [coders]);
    // unit-2 is overlap, not own: once, as overlap
    expect(await order("first")).toEqual(["unit-2", "unit-3", "unit-1"]);
    await redeploy({ units: { overlap: "after" } }, [coders]);
    expect(await order("last")).toEqual(["unit-1", "unit-2", "unit-3"]);
    // Ignored: no overlap units at all
    await redeploy({ units: { overlap: "ignore" } }, [coders]);
    expect(await order("none")).toEqual(["unit-1"]);
    // Spread (the default): all of them, the own unit among them
    await redeploy({ units: {} }, [coders]);
    expect((await order("plain")).sort()).toEqual(["unit-1", "unit-2", "unit-3"]);
    // Without the coder's own units: only the special ones
    await redeploy({ units: { coding: false, overlap: "before" } }, [coders]);
    expect(await order("special")).toEqual(["unit-2", "unit-3"]);
  });

  it("a crowd's column gives the overlap: the queue divides the rest, every coder gets the overlap", async () => {
    await createSet("_overlap", ["unit-3"], "extra");
    await redeploy({ units: { overlap: "after" } }, [
      crowd({ codersPerUnit: { min: 1, max: 1 } }, { column: "extra" }),
    ]);
    expect(await order("first-coder")).toEqual(["unit-1", "unit-2", "unit-3"]);
    // The queue is done; the overlap is everyone's
    expect(await order("second-coder")).toEqual(["unit-3"]);
  });

  it("take a subset of the session's units: some sets of a set column", async () => {
    await createSet("pre", ["unit-1"], "phase");
    await createSet("post", ["unit-2", "unit-3"], "phase");
    await redeploy({ units: { subset: { column: "phase", sets: ["post"] } } });
    expect(await order("only")).toEqual(["unit-2", "unit-3"]);
    await redeploy({ units: { subset: { column: "phase", sets: ["pre", "post"] } } });
    expect(await order("both")).toEqual(["unit-1", "unit-2", "unit-3"]);
  });
});

describe("routing by session values", () => {
  const condition = {
    type: "computed",
    name: "condition",
    variable: { type: "random", draw: "balanced", options: [{ value: "s1" }, { value: "s2" }], units: "g" },
  };

  it("a computed value linked to a column selects the units; it can't be overwritten, and stays across restarts", async () => {
    await createSet("s1", ["unit-1"]);
    await createSet("s2", ["unit-2"]);
    await redeploy({}, [condition]);
    const carol = coder("carol");
    expect(await reach(carol, "condition")).toEqual([{ value: "s1" }]);
    const first = await carol.next();
    expect(first!.externalId).toBe("unit-1");
    // the client can't overwrite computed values
    const tamper = await carol.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { condition: { done: true, values: [{ value: "s2" }] } } }),
    });
    expect(tamper.status).toBe(204);
    expect((await carol.session()).variables.condition.values).toEqual([{ value: "s1" }]);

    // even after a restart, carol has the same units
    server = restart();
    const again = coder("carol", null);
    expect((await again.next())!.id).toBe(first!.id);

    // balanced across a restart: the counts are in the database
    const dave = coder("dave");
    expect(await reach(dave, "condition")).toEqual([{ value: "s2" }]);
    expect((await dave.next())!.externalId).toBe("unit-2");
  });

  it("a coder's units follow the session when the loop moves or its settings change; what they coded stays theirs", async () => {
    await createSet("s1", ["unit-1", "unit-3"]);
    await createSet("s2", ["unit-2"]);
    await redeploy({}, [condition]);
    const b = coder("b");
    expect(await reach(b, "condition")).toEqual([{ value: "s1" }]);
    const coded = (await b.next())!;
    expect(coded.externalId).toBe("unit-1");
    expect((await b.submit(coded.id, sentiment("positive"))).status).toBe(200);
    // Another loop in front: this one is loop 2 now, and has another label
    const warmUp = { type: "question", name: "warm_up", variable: { type: "confirm", question: "?" } };
    const before = { type: "unit_loop", label: "warm-up", children: [{ type: "layout", template: "" }, warmUp] };
    await redeploy({ label: "renamed" }, [condition, before]);
    expect((await b.next("2"))!.externalId).toBe("unit-3");
    // A subset that leaves out what b coded: b can still go back to it and change the answer
    await createSet("late", ["unit-3"], "phase");
    await redeploy({ units: { subset: { column: "phase", sets: ["late"] } } }, [condition]);
    expect((await b.call(`/loop/1/units/${coded.id}`)).status).toBe(200);
    expect((await b.submit(coded.id, sentiment("negative"))).status).toBe(200);
    expect((await b.next())!.externalId).toBe("unit-3");
  });
});

describe("sessions", () => {
  it("keeps a device id in an httpOnly cookie; stores only a per-study hash of it, with coarse device details", async () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const res = await send("browser", "/session", {}, { "x-link-secret": "demo-secret", "user-agent": iphone });
    expect(res.status).toBe(200);
    const [set] = res.headers.getSetCookie();
    expect(set).toMatch(/^annotinder_device=/);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/api/d");

    const deviceId = devices.get("browser")!.cookies.get("annotinder_device")!;
    const { sessionId } = (await res.json()) as SessionResponse;
    const [stored] = await query<{ key_hash: string; device_type: string; browser: string; os: string }>(
      db,
      "SELECT key_hash, device_type, browser, os FROM session_devices WHERE session_id = $1",
      [sessionId],
    );
    const { createHash } = await import("node:crypto");
    expect(stored).toEqual({
      key_hash: createHash("sha256").update(`${deviceId}\n1\n`).digest("hex"),
      device_type: "phone",
      browser: "Safari",
      os: "iOS",
    });
    // The device id itself is stored nowhere
    expect(JSON.stringify(await query(db, "SELECT * FROM coder_sessions"))).not.toContain(deviceId);

    // the cookie continues the session; it isn't set again
    const again = await send("browser", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(((await again.json()) as SessionResponse).sessionId).toBe(sessionId);
    expect(again.headers.getSetCookie()).toEqual([]);
  });

  it("records the device each answer was given on", async () => {
    const c = coder("answerer");
    const unit = await c.next();
    await c.submit(unit!.id, demo("neutral"));
    const rows = await query<{ device_id: number | null }>(
      db,
      "SELECT DISTINCT device_id FROM annotation_values WHERE unit_id = $1",
      [unit!.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].device_id).not.toBeNull();
    const listed = (await (await server.request("/api/study/1/devices", { headers: adminHeaders })).json()) as {
      id: number;
    }[];
    expect(listed.map((d) => d.id)).toContain(rows[0].device_id);
  });

  it("refuses requests without the client header (CSRF)", async () => {
    const res = await server.request("/api/d/1/session", { headers: { "x-link-secret": "demo-secret" } });
    expect(res.status).toBe(403);
  });

  it("continues a device's session whatever link it comes back with; separate per participant", async () => {
    const other = await link();
    const a = (await (
      await send("shared", "/session", {}, { "x-link-secret": "demo-secret" })
    ).json()) as SessionResponse;
    const b = (await (await send("shared", "/session", {}, { "x-link-secret": other })).json()) as SessionResponse;
    const bare = (await (await send("shared", "/session")).json()) as SessionResponse; // no link at all
    expect(b.sessionId).toBe(a.sessionId);
    expect(bare.sessionId).toBe(a.sessionId);

    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const panel = "demo-secret";
    const p1 = (await (
      await send("shared", "/session", {}, { "x-link-secret": panel, "x-url-params": "participant=P1" })
    ).json()) as SessionResponse;
    const p2 = (await (
      await send("shared", "/session", {}, { "x-link-secret": panel, "x-url-params": "participant=P2" })
    ).json()) as SessionResponse;
    expect(new Set([a.sessionId, p1.sessionId, p2.sessionId]).size).toBe(3);
    // One cookie for all of it
    expect(devices.get("shared")!.cookies.size).toBe(1);
  });

  it("knows a deployment by one spelling only", async () => {
    for (const id of ["01", "0001.preview", "1e3", "99999999999"]) {
      const res = await server.request(`/api/d/${id}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": "demo-secret" },
      });
      expect(res.status).toBe(404);
    }
  });

  it("sets no cookie when the link is refused", async () => {
    const res = await send("nobody", "/session", {}, { "x-link-secret": "wrong" });
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("URL parameters", () => {
  it("start only with them (fitting their values), and keep them as $session values", async () => {
    await redeploy({}, [
      sessionItem({
        invite: { mode: "crowd", coderParam: { param: "PROLIFIC_PID", pattern: "[0-9a-f]{4}" } },
        urlParams: [
          { name: "study", param: "STUDY_ID" },
          { name: "src", values: [{ value: "panel" }, { value: "mail" }] },
          { name: "wave", pattern: "[0-9]", default: "1" },
        ],
      }),
    ]);
    const start = (device: string, params: string) =>
      send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params });

    const missing = await start("u1", "PROLIFIC_PID=ab12&src=panel");
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      code: "url_param_missing",
      error: expect.stringContaining("STUDY_ID"),
    });
    const invalid = await start("u2", "PROLIFIC_PID=xyz&STUDY_ID=s1&src=panel");
    expect(await invalid.json()).toMatchObject({ code: "url_param_invalid" });
    expect((await (await start("u3", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=web")).json()) as object).toMatchObject({
      code: "url_param_invalid",
    });
    // Values are at most 256 characters, with or without a pattern
    expect(
      (await (await start("u5", `PROLIFIC_PID=ab12&STUDY_ID=${"s".repeat(300)}&src=mail`)).json()) as object,
    ).toMatchObject({ code: "url_param_invalid" });

    const okRes = await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail&source=newsletter&other=x");
    const ok = (await okRes.json()) as SessionResponse;
    expect(okRes.status, JSON.stringify(ok)).toBe(200);
    expect(ok.session).toEqual({ coder: "ab12", study: "s1", src: "mail", wave: "1", source: "newsletter" });
    // The same link again (the client sends the page's parameters with every request): the same session
    const again = (await (await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail")).json()) as SessionResponse;
    expect(again.sessionId).toBe(ok.sessionId);
    // Kept without the other parameters, also after a restart (the coder id is part of the device's session key)
    server = restart();
    expect(
      ((await (await send("u4", "/session", {}, { "x-url-params": "PROLIFIC_PID=ab12" })).json()) as SessionResponse)
        .session,
    ).toEqual(ok.session);
    const coders = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    expect(coders.find((c) => c.coder === "ab12")?.session, JSON.stringify(coders)).toEqual({
      coder: "ab12",
      study: "s1",
      src: "mail",
      wave: "1",
      source: "newsletter",
    });
  });
});

describe("the coder's display", () => {
  it("is recorded when it changes, with when; the same again isn't; at most 100", async () => {
    const c = coder("screen");
    const post = (entry: object) => c.call("/display", { method: "POST", body: JSON.stringify(entry) });
    expect((await post({ keys: "numbers", width: "narrow" })).status).toBe(204);
    await post({ keys: "numbers", width: "narrow" });
    await post({ keys: "numpad", width: "wide" });
    expect((await post({ keys: "" })).status).toBe(400);
    const progress = async () =>
      ((await (await server.request("/api/study/1/coders", { headers: adminHeaders })).json()) as CoderProgress[])[0];
    expect((await progress()).display).toEqual([
      { keys: "numbers", width: "narrow", at: expect.any(String) },
      { keys: "numpad", width: "wide", at: expect.any(String) },
    ]);
    for (let i = 0; i < 120; i++) await post({ keys: i % 2 ? "letters" : "numbers" });
    expect((await progress()).display).toHaveLength(100);
  });
});

describe("the coder's id from the URL", () => {
  it("is $session.coder; optional: a link without it starts without one", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "PID", optional: true } })]);
    const start = (device: string, params: string) =>
      send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params });
    expect(((await (await start("o1", "PID=abc")).json()) as SessionResponse).session).toEqual({ coder: "abc" });
    const without = await start("o2", "");
    expect(without.status).toBe(200);
    expect(((await without.json()) as SessionResponse).session).toEqual({});
    // Required (the default): refused without it
    await redeploy({}, [crowd(undefined, { coderParam: { param: "PID" } })]);
    expect(await (await start("o3", "")).json()).toMatchObject({ code: "url_param_missing" });
  });
});

describe("quitting and deleting a coder's data", () => {
  it("lets a coder quit and ask for deletion; the researcher deletes later, then now, and the deletion is logged", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const link = { "x-link-secret": "demo-secret", "x-url-params": "participant=P77" };
    const unit = ((await (await send("quitter", "/loop/1/next", {}, link)).json()) as { units: CoderUnitResponse[] })
      .units[0];
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
    expect((await send("quitter", "/loop/1/next", {}, link)).status).toBe(409);

    const listed = async () =>
      ((await (await server.request("/api/study/1/coders", { headers: adminHeaders })).json()) as CoderProgress[]).find(
        (c) => c.coder === "P77",
      );
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

describe("practice and gold units", () => {
  it("practice units come first, with their checks; gold units are checked silently, and health running out ends the session", async () => {
    const { data: base } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        units: [
          {
            externalId: "p1",
            data: {
              ...base,
              sentiment_practice: "negative",
              sentiment_practice_message: "It reports a disaster.",
              sentiment_gold: null,
            },
          },
          {
            externalId: "g1",
            data: { ...base, sentiment_practice: null, sentiment_practice_message: null, sentiment_gold: "neutral" },
          },
          {
            externalId: "g2",
            data: { ...base, sentiment_practice: null, sentiment_practice_message: null, sentiment_gold: "neutral" },
          },
        ],
      }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    await createSet("s1", ["unit-1"], "phase");
    await createSet("_practice", ["p1"]);
    await createSet("_gold", ["g1", "g2"]);
    const end = { type: "end", name: "low_quality", outcome: "screenout", message: "Thank you" };
    await redeploy(
      {
        units: {
          subset: { column: "phase", sets: ["s1"] },
          practice: "before",
          practiceCheck: { questions: ["sentiment"] },
          gold: "after",
          goldCheck: { questions: ["sentiment"], health: { start: 2, wrong: -1, end: "low_quality" } },
        },
      },
      [crowd(undefined, { column: "g" }), end],
    );
    const c = coder("trainee");
    const submit = async (unitId: number, code: string) => {
      const res = await c.submit(unitId, sentiment(code));
      expect(res.status).toBe(200);
      return res.json();
    };
    // The practice unit first, marked as such; its answer columns are never served
    const practice = (await c.next())!;
    expect(practice.externalId).toBe("p1");
    expect(practice.data).toMatchObject({ _practice: true });
    expect(practice.data).not.toHaveProperty("sentiment_practice");
    // Its checks come along, for the browser (retry by default); the server doesn't check practice
    expect(practice.practice).toEqual({
      retry: true,
      questions: { sentiment: { key: "negative", message: "It reports a disaster." } },
    });
    expect(await submit(practice.id, "negative")).toEqual({});
    // Then their own unit, then the gold units: nothing tells them they are gold
    const own = (await c.next())!;
    expect(own.externalId).toBe("unit-1");
    expect(own.data).not.toHaveProperty("_practice");
    expect(await submit(own.id, "positive")).toEqual({});
    const g1 = (await c.next())!;
    expect(g1.data).not.toHaveProperty("sentiment_gold");
    expect(await submit(g1.id, "positive")).toEqual({}); // wrong: health 1
    const g2 = (await c.next())!;
    expect(await submit(g2.id, "positive")).toEqual({ end: "low_quality" }); // wrong again: health 0
    expect((await c.session()).ended).toMatchObject({ item: "low_quality", outcome: "screenout" });
    // The Coders tab counts the special units each coder finished
    const coders = (await (await server.request("/api/study/1/coders", { headers: adminHeaders })).json()) as {
      ended: unknown;
      special: object;
    }[];
    expect(coders.find((x) => x.ended)?.special).toEqual({
      practice: { done: 1, total: 1 },
      gold: { done: 2, total: 2 },
    });
  });
});

describe("auto questions", () => {
  const value = (v: string) => ({ done: true, skip: false, values: [{ value: v }] });

  it("are assigned when reached, once; coders who never reach them don't count", async () => {
    const condition = {
      type: "computed",
      name: "condition",
      variable: { type: "random", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
    };
    await redeploy({}, [condition]);
    // Loading the session assigns nothing: a coder screened out before the question doesn't count
    const early = coder("early");
    expect((await early.session()).variables.condition).toBeUndefined();
    expect(await reach(coder("first"), "condition")).toEqual([{ value: "a" }]);
    expect(await reach(coder("first", null), "condition")).toEqual([{ value: "a" }]); // the same, reached again
    expect(await reach(coder("second"), "condition")).toEqual([{ value: "b" }]);
    expect(await reach(early, "condition")).toEqual([{ value: "a" }]);
    expect((await coder("x").call("/variables/computed/nope", { method: "POST" })).status).toBe(404);
  });

  it("balance within groups of earlier answers or session values (stratified)", async () => {
    const gender = {
      type: "question",
      name: "gender",
      variable: { type: "nominal", question: "Gender?", options: [{ value: "f" }, { value: "m" }] },
    };
    const condition = {
      type: "computed",
      name: "condition",
      variable: {
        type: "random",
        draw: "balanced",
        options: [{ value: "a" }, { value: "b" }],
        stratify: ["gender", "session.wave"],
      },
    };
    await redeploy({}, [
      sessionItem({ urlParams: [{ name: "wave", values: [{ value: "1" }, { value: "2" }], default: "1" }] }),
      gender,
      condition,
    ]);
    const start = async (name: string, g: string, wave = "1") => {
      const c = coder(name);
      await send(name, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": `wave=${wave}` });
      await c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: { gender: value(g) } }) });
      return reach(c, "condition");
    };
    // Women and men are balanced separately: each group starts with a
    expect(await start("w1", "f")).toEqual([{ value: "a" }]);
    expect(await start("m1", "m")).toEqual([{ value: "a" }]);
    expect(await start("w2", "f")).toEqual([{ value: "b" }]);
    expect(await start("m2", "m")).toEqual([{ value: "b" }]);
    // ... and per wave
    expect(await start("w3", "f", "2")).toEqual([{ value: "a" }]);
    // A stratify name that is no question before it, or no session value: an issue
    const bad = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        items: [{ ...condition, variable: { ...condition.variable, stratify: ["later", "session.nope"] } }, gender],
      }),
    });
    expect(((await bad.json()) as { valid: boolean }).valid).toBe(false);
  });
});

describe("balanced draws", () => {
  it("break a tie at random", async () => {
    const computed = {
      type: "computed",
      name: "arm",
      variable: { type: "random", draw: "balanced", options: [{ value: "a" }, { value: "b" }, { value: "c" }] },
    };
    await redeploy({}, [computed]);
    // random() near 1: the last of the tied values; then only the values with the fewest are candidates
    server = restart({ random: () => 0.99 });
    expect(await reach(coder("x1"), "arm")).toEqual([{ value: "c" }]);
    expect(await reach(coder("x2"), "arm")).toEqual([{ value: "b" }]);
    server = restart({ random: () => 0 });
    expect(await reach(coder("x3"), "arm")).toEqual([{ value: "a" }]);
    expect(await reach(coder("x4"), "arm")).toEqual([{ value: "a" }]);
  });
});

describe("coder-level answers", () => {
  it("are answer rows without a unit, one per question, assigned values marked; only changed answers are written", async () => {
    const group = {
      type: "computed",
      name: "group",
      variable: { type: "random", draw: "random", options: [{ value: "a" }, { value: "b" }] },
    };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    const city = {
      type: "question",
      name: "city",
      variable: { type: "nominal", question: "City?", options: [{ value: "Utrecht" }, { value: "Gent" }] },
    };
    await redeploy({}, [group, age, city]);
    const c = coder("surveyed");
    await c.session();
    expect((await c.call("/variables/computed/group", { method: "POST" })).status).toBe(200);
    const post = (variables: object) =>
      c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    expect((await post({ age: value(30), city: value("Utrecht") })).status).toBe(204);
    expect((await post({ age: value(31), city: value("Utrecht") })).status).toBe(204);

    const rows = await query<{
      variable: string;
      unit_id: number | null;
      assigned: boolean;
      created: Date;
      updated: Date;
      device_id: number | null;
    }>(
      db,
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
    const page = (await (await server.request("/api/study/1/annotations", { headers: adminHeaders })).json()) as {
      annotations: { unitId: number | null; variable: string; assigned: boolean }[];
    };
    expect(
      page.annotations
        .filter((a) => a.unitId === null)
        .map((a) => a.variable)
        .sort(),
    ).toEqual(["age", "city", "group"]);
    const coders = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    expect(coders[0].variables).toMatchObject({ age: value(31), city: value("Utrecht") });
    // A reload (a restart of the runtime) reads them back
    server = restart();
    expect((await c.session()).variables).toMatchObject({ age: value(31) });
  });
});

describe("pausing a study", () => {
  it("lets coders save what they have, gives no new units or sessions, and doesn't reload coders", async () => {
    const c = coder("working");
    const [first, second] = await c.batch(2);
    const before = (await c.session()).version;
    const deployment = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
      designVersionId: number;
    };
    const pause = (active: boolean) =>
      server.request("/api/study/1/deployment", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ designVersionId: deployment.designVersionId, active }),
      });
    await pause(false);
    expect((await c.session()).version).toBe(before); // no reload for coders
    // What they have open is saved
    expect((await c.submit(first.id, demo("neutral"))).status).toBe(200);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(200);
    // No new units, no new sessions
    const next = await c.call("/loop/1/next");
    expect(next.status).toBe(409);
    expect(await next.json()).toMatchObject({ code: "study_paused" });
    const newcomer = await coder("newcomer").call("/session");
    expect(newcomer.status).toBe(409);
    expect(await newcomer.json()).toMatchObject({ code: "study_paused" });
    // Resumed: they go on
    await pause(true);
    expect((await c.next())?.externalId).toBe("unit-3");
    expect((await coder("newcomer").call("/session")).status).toBe(200);
  });
});

describe("frozen answers", () => {
  it("an answer a unit loop depends on can't change once the coder coded a unit there", async () => {
    const role = {
      type: "question",
      name: "role",
      variable: { type: "nominal", question: "Role?", options: [{ value: "student" }, { value: "expert" }] },
    };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    await redeploy({ layout: { template: "As {{$var.role.label}}:" } }, [role, age]);
    const c = coder("freezer");
    await c.session();
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    const post = (variables: object) =>
      c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    expect((await post({ role: value("student"), age: value(30) })).status).toBe(204);
    expect((await c.session()).frozen).toEqual([]);

    const unit = await c.next();
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(200);
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
    expect(
      (
        await c.call("/variables/unit", {
          method: "POST",
          body: JSON.stringify({
            unitId: unit!.id,
            variables: sentiment("positive"),
            timings: { sentiment: timing(4000), other: timing(1) },
          }),
        })
      ).status,
    ).toBe(200);

    const page = (await (await server.request("/api/study/1/annotations", { headers: adminHeaders })).json()) as {
      annotations: { unitId: number | null; variable: string; timing: unknown; servedAt: string | null }[];
    };
    const byVariable = Object.fromEntries(page.annotations.map((a) => [a.variable, a]));
    expect(byVariable.age).toMatchObject({ timing: timing(3000), servedAt: null });
    expect(byVariable.sentiment).toMatchObject({ timing: timing(4000), servedAt: expect.any(String) });
    expect(byVariable.other).toBeUndefined();
    // A bad timing is refused
    expect(
      (
        await post({
          variables: { age: value(30) },
          timings: { age: { firstMs: -1, totalMs: 0, hiddenMs: 0, edits: 0 } },
        })
      ).status,
    ).toBe(400);
  });
});

describe("limits", () => {
  it("a study past its owner's limit on coders takes no new ones; existing coders go on", async () => {
    const first = coder("first");
    await first.session();
    const owner = await ensureUser(db, "owner@uni.nl");
    await query(db, "UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify({ codersPerStudy: 1 }), owner.id]);
    await query(db, "UPDATE studies SET owner_id = $1 WHERE id = 1", [owner.id]);
    const refused = await coder("second").call("/session");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "study_full" });
    expect((await first.call("/session")).status).toBe(200);
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
  const session = async (device: string, secret: string | null) => {
    const res = await send(device, "/session", {}, secret ? { "x-link-secret": secret } : {});
    return { status: res.status, body: (await res.json()) as SessionResponse & { code?: string } };
  };

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

    const coders = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    expect(coders.find((c) => c.id === phone.body.sessionId)?.email).toBe("a@example.org");
  });

  it("coders may always sign in: links the email to the session started on the device, not shown to researchers", async () => {
    const secret = "demo-secret";
    const before = await session("tablet", secret);
    expect(before.body.login).toBeNull();
    const user = await ensureUser(db, "c@example.org");
    devices.get("tablet")!.cookies.set("annotinder_session", await createSession(db, user.id, CODER_LOGIN));
    const after = await session("tablet", secret);
    expect(after.body).toMatchObject({ sessionId: before.body.sessionId, login: "c@example.org" });
    await loggedIn("desktop", "c@example.org");
    expect((await session("desktop", secret)).body.sessionId).toBe(before.body.sessionId);

    // One session per email in a study: a device that started its own, then logs in, continues the email's session
    const own = await session("phone", secret);
    expect(own.body.sessionId).not.toBe(before.body.sessionId);
    const phoneUser = await ensureUser(db, "c@example.org");
    devices.get("phone")!.cookies.set("annotinder_session", await createSession(db, phoneUser.id, CODER_LOGIN));
    expect((await session("phone", secret)).body.sessionId).toBe(before.body.sessionId);

    // The researcher sees no email where the invitation doesn't require sign-in
    const coders = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    expect(coders.find((c) => c.id === before.body.sessionId)).toMatchObject({ id: before.body.sessionId });
    expect(coders.find((c) => c.id === before.body.sessionId)!.email).toBeUndefined();
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

  it("refuses sessions without a login when the invitation requires sign-in", async () => {
    await redeploy({}, [crowd(undefined, { login: true })]);
    const res = await send("login", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth_required" });
  });
});

describe("resuming and codebook updates", () => {
  it("refuses requests made with an older design version, until the session is loaded again", async () => {
    const c = coder("v");
    const { version } = await c.session();
    const unit = await c.next();
    const withVersion = (v: number) => ({ headers: { "x-annotinder-version": String(v) } });
    const answers = JSON.stringify({ unitId: unit!.id, variables: demo("neutral") });

    await redeploy({ units: {} }); // v2: only `sentiment`
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
    expect(fresh.status).toBe(200);
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

  it("keeps answers to questions a design update removed, and tags the design version", async () => {
    // demo codebook: sentiment + actors_and_issues + other loop questions
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: {} }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(200);

    const [stored] = await dbAnnotations();
    expect(stored.variables.sentiment.values).toEqual([{ value: "positive" }]);
    expect(stored.variables).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    const sentimentRows = await query(
      db,
      `SELECT design_version_id AS "designVersionId" FROM annotation_values WHERE variable = 'sentiment'`,
    );
    expect(sentimentRows).toEqual([{ designVersionId: 2 }]);
  });
});

describe("rebuilding from the database", () => {
  const agreeing = crowd({ until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 } });
  const status = async () =>
    (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;

  it("keeps saturation the same across a restart with an agreement rule", async () => {
    await redeploy({}, [
      crowd({ until: { agree: 2, on: "sentiment" }, codersPerUnit: { max: 3 }, priority: "saturate" }),
    ]);
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
    const rows = await new DbStore(db, 1).listFinished({
      loops: [{ loop: "main_loop", variables: ["sentiment"], values: ["sentiment"] }],
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => Object.keys(r.values ?? {}).join() === "sentiment")).toBe(true);
  });

  it("keeps answers to removed questions when resubmitting after a restart", async () => {
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });
    await redeploy({ units: {} }); // v2: only `sentiment`

    server = restart();
    const again = coder("upd", null);
    expect((await again.submit(unit!.id, sentiment("positive"))).status).toBe(200);
    expect((await dbAnnotations())[0].variables).toHaveProperty("actors_and_issues");
  });

  it("keeps codings across a redeploy that keeps the loops, and derives them again when they change", async () => {
    const codings = () => query<{ agreement: Record<string, string> }>(db, "SELECT agreement FROM unit_codings");

    // v2 changes the loop's questions (demo had six): finished units must be derived again
    await redeploy({ units: {} });
    const c = coder("re");
    await c.submit((await c.next())!.id, sentiment("neutral"));
    expect(await codings()).toEqual([{ agreement: {} }]);

    // v3, same loop: kept
    await redeploy({ units: {} });
    expect((await c.next())?.externalId).toBe("unit-2");

    // v4 adds an agreement rule: the codings are derived again, with its answers (also with two processes)
    await redeploy({}, [agreeing]);
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
    expect((await c.submit(first!.id, demo("positive"))).status).toBe(200);

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
  const fixedMain = { units: {} };

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

    const res = await server.request("/api/study/1/annotations/reset", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["sentiment"], unitIds: [first!.id] }),
    });
    expect(await res.json()).toEqual({ retired: 1 });

    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(first!.id);
    expect(again!.variables).toEqual({}); // retired values are not served
    expect(await query(db, "SELECT COUNT(*)::int AS n FROM annotation_values WHERE retired_at IS NOT NULL")).toEqual([
      { n: 1 },
    ]);
  });

  it("tracks a unit separately in each loop it appears in", async () => {
    const second = {
      type: "unit_loop",
      label: "second_loop",
      units: {},
      children: [{ type: "layout", template: "" }, relevance],
    };
    await redeploy(fixedMain, [second]);
    const c = coder("two");
    // Loops are numbered by position: second_loop (first in the design) is 1, main_loop 2.
    const unit = await c.next("2");
    expect((await c.submit(unit!.id, sentiment("neutral"), "2")).status).toBe(200);

    // finished in main_loop, not in second_loop
    expect((await c.next("2"))!.id).not.toBe(unit!.id);
    expect((await c.next("1"))!.id).toBe(unit!.id);
    const progress = Object.fromEntries((await c.session()).progress.map((p) => [p.set, p.doneUnitIds]));
    expect(progress).toEqual({ 1: [], 2: [unit!.id] });
  });
});

describe("state in the database, not in memory", () => {
  it("keeps no units: a unit changed after it was served is served as deployed now", async () => {
    const c = coder("units");
    const unit = (await c.next())!;
    await c.submit(unit.id, demo("neutral"));
    const { externalId, data } = await draftUnit(unit.id);
    const upload = { units: [{ externalId, data: { ...data, text: "fixed" } }], overwriteCoded: true };
    expect(
      (
        await server.request("/api/study/1/units", {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify(upload),
        })
      ).status,
    ).toBe(201);
    const back = async () => ((await (await c.call(`/loop/1/units/${unit.id}`)).json()) as CoderUnitResponse).data.text;
    expect(await back()).toBe(data.text);
    await deployDrafts();
    expect(await back()).toBe("fixed");
  });

  it("works across server processes: changes, sessions and transfer links are in the database", async () => {
    const c = coder("two-servers");
    await c.session();
    const other = restart(); // a second process on the same database, running alongside
    const first = server;
    // A transfer link made on one process is redeemed on the other
    const { token } = (await (await c.call("/transfer", { method: "POST" })).json()) as { token: string };
    const phone = coder("phone", null, () => other);
    expect((await phone.call("/transfer/redeem", { method: "POST", body: JSON.stringify({ token }) })).status).toBe(
      200,
    );
    expect((await phone.session()).sessionId).toBe((await c.session()).sessionId);
    // Pausing the study on one process is seen at once by the other
    server = other;
    const deployment = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
      designVersionId: number;
    };
    await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: deployment.designVersionId, active: false }),
    });
    server = first;
    expect((await c.call("/loop/1/next")).status).toBe(409);
  });

  it("hands out a shared queue's units once, also when two processes are asked at the same time", async () => {
    await createSet("pair", ["unit-1", "unit-2"]);
    await redeploy({ units: { subset: { column: "g", sets: ["pair"] } } }, [
      crowd({ codersPerUnit: { min: 1, max: 1 } }),
    ]);
    const other = restart();
    const [a, b] = await Promise.all([coder("left").next(), coder("right", "demo-secret", () => other).next()]);
    expect(new Set([a!.id, b!.id]).size).toBe(2);
    expect(await query(db, "SELECT count(*)::int AS n FROM unit_leases")).toEqual([{ n: 2 }]);
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
    await redeploy({ units: { subset: { column: "g", sets: ["queue"] } } }, [
      crowd({ codersPerUnit: { min: 1, max: 1 } }),
    ]);
    const a = coder("a-batch");
    const b = coder("b-batch");
    const held = await a.batch(2);
    expect(held).toHaveLength(2);
    // the other coder gets what is left first (leased units are taken)
    expect((await b.next())!.externalId).toBe("unit-3");
    // a submits from the batch, in any order
    expect((await a.submit(held[1].id, sentiment("positive"))).status).toBe(200);
    expect((await a.submit(held[0].id, sentiment("positive"))).status).toBe(200);
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
      await db
        .select({ data: unitVersionData(annotationValues.unitVersionId) })
        .from(annotationValues)
        .where(and(eq(annotationValues.unitId, unitId), isNull(annotationValues.retiredAt)))
        .limit(1)
    )[0]?.data;
  const upload = (units: object[], extra: object) =>
    server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, ...extra }),
    });

  it("records the version of a unit each coder saw, also when it changed after it was served", async () => {
    const c = coder("hash");
    const first = (await c.next())!;
    await c.submit(first.id, demo("neutral"));
    expect(await versionOf(first.id)).toMatchObject(first.data);

    const second = (await c.next())!;
    const before = await draftUnit(second.id);
    // The researcher replaces it while the coder has it open (not coded yet).
    expect(
      (await upload([{ externalId: before.externalId, data: { ...before.data, text: "edited" } }], { overwrite: true }))
        .status,
    ).toBe(201);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(200);
    expect((await versionOf(second.id))?.text).toBe(before.data.text);
  });

  it("replaces a coded unit only when asked to; its answers keep the version their coder saw", async () => {
    const a = coder("a");
    const unit = (await a.next())!;
    await a.submit(unit.id, demo("neutral"));
    const row = await draftUnit(unit.id);
    const edited = [{ externalId: row.externalId, data: { ...row.data, text: "edited" } }];

    expect((await upload(edited, { overwrite: true })).status).toBe(409);
    expect((await upload(edited, { overwrite: true, overwriteCoded: true })).status).toBe(201);
    await deployDrafts();
    // The next coder sees the new text; the first answer still has the old one.
    expect((await coder("b").next())!.data.text).toBe("edited");
    expect((await versionOf(unit.id))?.text).toBe(row.data.text);

    const page = (await (await server.request("/api/study/1/unit-versions", { headers: adminHeaders })).json()) as {
      versions: { unitId: number; data: UnitData }[];
    };
    expect(page.versions.filter((v) => v.unitId === unit.id).map((v) => v.data.text)).toEqual([
      row.data.text,
      "edited",
    ]);
  });

  it("sends coders only the unit fields the design uses", async () => {
    expect((await upload([{ externalId: "secret", data: { headline: "h", text: "t" } }], {})).status).toBe(201);
    await redeploy({ layout: { template: "$unit.headline" } });
    const unit = (await coder("c").next())!;
    expect(Object.keys(unit.data)).toEqual(["headline"]);
  });
});

describe("unit versions are made by deploys", () => {
  const count = async (sql: string, params: unknown[] = []) => (await query<{ n: number }>(db, sql, params))[0].n;
  const upload = async (units: object[]) => {
    const res = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, overwrite: true, overwriteCoded: true }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
  };

  it("keeps only deployed content: draft edits make no versions, and a replaced version nobody coded goes", async () => {
    const id = (await unitByExternalId("unit-1")).id;
    const { data } = await draftUnit(id);
    const versions = () => count("SELECT COUNT(*)::int AS n FROM unit_versions WHERE unit_id = $1", [id]);
    const value = (text: string) =>
      count("SELECT COUNT(*)::int AS n FROM unit_values WHERE study_id = 1 AND value = to_jsonb($1::text)", [text]);
    expect(await versions()).toBe(1);
    // Edited twice in the draft: no versions, and the first edit's value is gone
    await upload([{ externalId: "unit-1", data: { ...data, text: "first edit" } }]);
    await upload([{ externalId: "unit-1", data: { ...data, text: "second edit" } }]);
    expect(await versions()).toBe(1);
    expect(await value("first edit")).toBe(0);
    // Deployed: a new version; the old one, never coded, is gone
    await deployDrafts();
    expect(await versions()).toBe(1);
    expect((await draftUnit(id)).data.text).toBe("second edit");
    // Coded, then replaced and deployed: the coded version stays
    const c = coder("v");
    const unit = (await c.next())!;
    expect(unit.data.text).toBe("second edit");
    await c.submit(unit.id, demo("neutral"));
    await upload([{ externalId: "unit-1", data: { ...data, text: "third edit" } }]);
    await deployDrafts();
    expect(await versions()).toBe(2);
    expect(await value("second edit")).toBe(1);
  });
});

describe("deployment settings", () => {
  it("fill in end items' panel return links, and the design's sample size per link limits its sessions", async () => {
    const end = { type: "end", name: "done", outcome: "complete", redirectSetting: "panel_done" };
    const deployed = await redeploy({}, [crowd(undefined, { maxCoders: 1 }), end]);
    expect(deployed.warnings).toContainEqual(expect.stringContaining("'panel_done', which has no URL yet"));
    expect(JSON.stringify((await coder("first").session()).codebook.items)).not.toContain("redirectUrl");
    // The URL is a setting of the study: coders get it without a new version
    const put = await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Demo study",
        redirectUrls: { panel_done: "https://panel.example/done?id=$session.coder" },
      }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { redirectUrls: unknown }).redirectUrls).toEqual({
      panel_done: "https://panel.example/done?id=$session.coder",
    });
    type Item = { type: string; redirectUrl?: string; children?: Item[] };
    const items = (await coder("first").session()).codebook.items as Item[];
    const served = items.flatMap((i) => (i.type === "block" ? (i.children ?? []) : [i])).find((i) => i.type === "end");
    expect(served?.redirectUrl).toBe("https://panel.example/done?id=$session.coder");
    // maxUses 1: the demo link took "first"; a second new coder is refused
    const second = await send("second", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(second.status).toBe(403);
    expect(await second.json()).toMatchObject({ code: "link_used_up" });
  });
});

describe("review regressions", () => {
  it("an upload that makes a design draft keeps the session; an empty set is deployed", async () => {
    const session = {
      type: "session",
      urlParams: [{ name: "wave", values: [{ value: "1" }], default: "1" }],
    };
    const end = { type: "end", name: "done", outcome: "complete", redirectSetting: "panel" };
    await redeploy({}, [session, end]);
    // An upload with a new column after the deploy: the new draft keeps the session
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "n1", data: { ...data, extra: "x" } }] }),
    });
    expect(upload.status).toBe(201);
    const list = (await (await server.request("/api/study/1/design", { headers: adminHeaders })).json()) as {
      id: number;
    }[];
    const draft = (await (
      await server.request(`/api/study/1/design/${list.at(-1)!.id}`, { headers: adminHeaders })
    ).json()) as { session: unknown };
    expect(draft.session).toMatchObject({ urlParams: [{ name: "wave" }] });
    // An empty set is a change to deploy, and reaches the live sets
    await createSet("empty", []);
    const pending = (await (
      await server.request("/api/study/1/deployment/pending", { headers: adminHeaders })
    ).json()) as { units: { sets: boolean } };
    expect(pending.units.sets).toBe(true);
    const deployed = await deployDrafts();
    const live = await query<{ name: string }>(
      db,
      "SELECT name FROM unit_sets WHERE study_id = 1 AND live AND name = 'empty'",
    );
    expect(live).toHaveLength(1);
    expect(deployed.version).toBeGreaterThan(1);
  });
});

describe("unit fields in the design", () => {
  it("keeps the session and public info next to the items, not among them", async () => {
    const session = { urlParams: [{ name: "wave", values: [{ value: "1" }] }] };
    const post = (body: object) =>
      server.request("/api/study/1/design", { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
    expect((await post({ items: [{ type: "session", ...session }] })).status).toBe(400);
    const created = (await (await post({ items: [], session })).json()) as {
      id: number;
      items: unknown[];
      session: unknown;
    };
    expect(created).toMatchObject({ items: [], session });
    // A write without `session` keeps it; `public` without: kept, null: removed
    const put = async (body: object) =>
      (await (
        await server.request(`/api/study/1/design/${created.id}`, {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify(body),
        })
      ).json()) as { session: unknown };
    expect((await put({ items: [] })).session).toEqual(session);
    expect((await put({ items: [], session: {} })).session).toEqual({});
    expect(((await put({ items: [], public: { title: "News" } })) as unknown as { public: unknown }).public).toEqual({
      title: "News",
    });
    expect(((await put({ items: [] })) as unknown as { public: unknown }).public).toEqual({ title: "News" });
    expect(((await put({ items: [], public: null })) as unknown as { public: unknown }).public).toBeNull();
  });

  it("are declared by uploads in the draft design, kept by codebook writes, and required to deploy", async () => {
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "with-extra", data: { ...data, source: "wire" } }] }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    // The deployed version is frozen: the new field goes into a new draft
    const list = (await (await server.request("/api/study/1/design", { headers: adminHeaders })).json()) as {
      id: number;
      note: string | null;
    }[];
    const draft = list.at(-1)!;
    expect(draft.note).toBe("Unit fields from an upload");
    const get = async (id: number) =>
      (await (await server.request(`/api/study/1/design/${id}`, { headers: adminHeaders })).json()) as {
        items: unknown[];
        units: { fields: { name: string; type: string }[] };
      };
    expect((await get(draft.id)).units.fields).toContainEqual({ name: "source", type: "text" });
    // A write without `units` keeps them
    const items = (await get(draft.id)).items;
    await server.request(`/api/study/1/design/${draft.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ items }),
    });
    expect((await get(draft.id)).units.fields.map((f) => f.name)).toContain("source");
    // A design using a field it doesn't declare can't be deployed
    const created = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        items: [
          {
            type: "unit_loop",
            units: {},
            children: [{ type: "layout", template: "$unit.nowhere" }, sentimentQuestion],
          },
        ],
      }),
    });
    const { id } = (await created.json()) as { id: number };
    const deploy = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: id }),
    });
    expect(deploy.status).toBe(400);
    expect(await deploy.json()).toMatchObject({ code: "undeclared_fields" });

    // Declared on the Units page (PUT /units/fields): then it deploys. Removing an unused field drops it from the draft units.
    const putFields = (fields: object[]) =>
      server.request("/api/study/1/units/fields", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ fields }),
      });
    const fields = (await get(id)).units.fields;
    expect((await putFields([...fields, { name: "nowhere", type: "number" }])).status).toBe(200);
    expect(
      (
        await server.request("/api/study/1/deployment", {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify({ designVersionId: id }),
        })
      ).status,
    ).toBe(200);
    const unit = await unitByExternalId("with-extra");
    expect((await draftUnit(unit.id)).data.source).toBe("wire");
    const kept = [...fields.filter((f) => f.name !== "source"), { name: "nowhere", type: "number" }];
    expect((await putFields(kept)).status).toBe(200);
    expect((await draftUnit(unit.id)).data).not.toHaveProperty("source");
    // A field the design uses can't be removed; a value that doesn't fit a new type stops a retype
    expect((await putFields(kept.filter((f) => f.name !== "nowhere"))).status).toBe(409);
    expect((await putFields(kept.map((f) => (f.name === "text" ? { ...f, type: "number" } : f)))).status).toBe(400);
  });
});

describe("set columns", () => {
  const draftFields = async () => {
    const [{ units }] = await query<{ units: { fields: { name: string; type: string }[] } }>(
      db,
      "SELECT units FROM design_versions WHERE study_id = 1 ORDER BY id DESC LIMIT 1",
    );
    return units.fields;
  };

  it("are unit fields of type set in the draft design: made with their sets, gone with them; never in uploads", async () => {
    await createSet("anna", ["unit-1"], "coder");
    expect(await draftFields()).toContainEqual({ name: "coder", type: "set" });
    // An upload doesn't give set columns as data
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "unit-x", data: { ...data, coder: "bob" } }] }),
    });
    expect(upload.status).toBe(400);
    expect(await upload.json()).toMatchObject({ error: expect.stringContaining("is a set column") });
    expect((await server.request("/api/study/1/sets/coder", { method: "DELETE", headers: adminHeaders })).status).toBe(
      204,
    );
    expect((await draftFields()).map((f) => f.name)).not.toContain("coder");
  });
});

describe("researcher preview", () => {
  const draft = async (note: string) => {
    const res = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        note,
        items: [
          {
            type: "unit_loop",
            label: note,
            children: [{ type: "layout", template: "" }, sentimentQuestion],
            units: {},
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
  };
  const openPreview = async () => {
    const res = await server.request("/api/study/1/deployment/preview", { method: "POST", headers: adminHeaders });
    expect(res.status).toBe(200);
    return (await res.json()) as { deploymentId: string; token: string };
  };
  /** A browser on the preview deployment, with its own cookie. */
  const previewer = (deploymentId: string, token: string) => {
    let cookie = "";
    return async (path: string, init: RequestInit = {}) => {
      const res = await server.request(`/api/d/${deploymentId}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-annotinder": "1", "x-link-secret": token, cookie },
      });
      const [set] = res.headers.getSetCookie();
      if (set) cookie = set.split(";")[0];
      return res;
    };
  };

  it("runs the latest design version, deployed or not, and picks up edits", async () => {
    await draft("draft 1");
    const { deploymentId, token } = await openPreview();
    expect(deploymentId).toBe("1.preview");
    const call = previewer(deploymentId, token);
    const label = (session: SessionResponse) => (session.codebook.items[0] as { label?: string }).label;
    expect(label((await (await call("/session")).json()) as SessionResponse)).toBe("draft 1");
    // the real deployment is untouched
    expect(label(await coder("real").session())).not.toBe("draft 1");

    await draft("draft 2");
    expect(label((await (await call("/session")).json()) as SessionResponse)).toBe("draft 2");
  });

  it("keeps the preview's coders and answers out of the database", async () => {
    await draft("draft");
    const coders = async () => (await query<{ n: number }>(db, "SELECT COUNT(*)::int AS n FROM coder_sessions"))[0].n;
    const before = await coders();
    const { deploymentId, token } = await openPreview();
    const call = previewer(deploymentId, token);
    const unit = ((await (await call("/loop/1/next")).json()) as { units: CoderUnitResponse[] }).units[0];
    const submit = await call("/variables/unit", {
      method: "POST",
      body: JSON.stringify({ unitId: unit.id, variables: sentiment("neutral") }),
    });
    expect(submit.status).toBe(200);
    expect(((await (await call("/session")).json()) as SessionResponse).progress[0].doneUnitIds).toEqual([unit.id]);
    expect(await dbAnnotations()).toEqual([]);
    expect(await coders()).toBe(before);
  });

  it("refuses forged, expired and other studies' tokens", async () => {
    await draft("draft");
    const { token } = await openPreview();
    const [, , exp, sig] = token.split(".");
    const tries = [
      `preview.1.${exp}.${"0".repeat(64)}`, // forged
      `preview.1.${Date.now() - 1000}.${sig}`, // expired (and so the signature no longer matches either)
      token.replace("preview.1.", "preview.2."), // another study
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
    const coders = (await (await server.request("/api/study/1/coders", { headers: adminHeaders })).json()) as {
      ended: unknown;
    }[];
    expect(coders[0].ended).toMatchObject({ item: "screen_out_young", outcome: "screenout" });
  });

  it("the study's normal end (the Study entry's end): coders get it as the last item; its redirect setting is resolved", async () => {
    await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Demo study", redirectUrls: { panel: "https://panel.example/done" } }),
    });
    await redeploy({}, [sessionItem({ end: { message: "Thank you", redirectSetting: "panel" } })]);
    const c = coder("finisher");
    const items = (await c.session()).codebook.items;
    expect(items.at(-1)).toEqual({
      type: "end",
      name: "_end",
      outcome: "complete",
      message: "Thank you",
      redirectUrl: "https://panel.example/done",
    });
    const end = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "_end" }) });
    expect(end.status).toBe(200);
    expect((await c.session()).ended).toMatchObject({ item: "_end", outcome: "complete" });
  });

  it("inside a unit loop: remember the unit; the closed session gets only what the end screen uses", async () => {
    // An end in the loop whose message uses a unit field and an answer
    await redeploy({
      children: [
        { type: "layout", template: "$unit.headline" },
        sentimentQuestion,
        { type: "end", name: "done_here", outcome: "complete", message: "$unit.headline: $var.sentiment.label" },
      ],
    });
    const c = coder("ender");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    const bogus = await c.call("/end", {
      method: "POST",
      body: JSON.stringify({ item: "done_here", unit: { loop: "1", id: 999999 } }),
    });
    expect(bogus.status).toBe(400);
    const end = await c.call("/end", {
      method: "POST",
      body: JSON.stringify({ item: "done_here", unit: { loop: "1", id: unit!.id } }),
    });
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
    expect(
      (
        await c.call("/variables/coder", {
          method: "POST",
          body: JSON.stringify({ variables: { age: { done: true, skip: false, values: [{ value: 30 }] } } }),
        })
      ).status,
    ).toBe(204);
    expect(await (await c.call("/end", { method: "POST", body: "{}" })).json()).toMatchObject({
      reopen: { until: expect.any(String) },
    });
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

  it("a study can keep finished sessions open", async () => {
    await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Demo", keepSessionsOpen: true }),
    });
    await redeploy({});
    const c = coder("keeper");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    await c.call("/end", { method: "POST", body: "{}" });
    expect((await c.session()).reopen).toEqual({ until: null });
    expect((await c.call(`/loop/1/units/${unit!.id}`)).status).toBe(200);
  });

  it("only for end items of the design", async () => {
    const res = await coder("other").call("/end", { method: "POST", body: JSON.stringify({ item: "consent" }) });
    expect(res.status).toBe(400);
  });
});

describe("unit fields", () => {
  it("$unit.id is each unit's id, sent only when the layout uses it", async () => {
    await redeploy({ layout: { template: "# $unit.id" } });
    const unit = (await coder("ids").next())!;
    expect(unit.data).toEqual({ id: unit.externalId });
  });
});

describe("a crowd with a set column", () => {
  it("makes a link per set; its coders code that set, up to the most coders of that link", async () => {
    await createSet("a", ["unit-1"], "batch");
    await createSet("b", ["unit-2", "unit-3"], "batch");
    await redeploy({}, [crowd(undefined, { column: "batch", maxCoders: 5, groupMaxCoders: { a: 1 } })]);
    const active = (await links()).filter((l) => !l.retiredAt);
    expect(active.map((l) => l.params)).toEqual([{ group: "a" }, { group: "b" }]);
    const listed = (await (await server.request("/api/study/1/links", { headers: adminHeaders })).json()) as {
      params: Record<string, string>;
      maxUses?: number;
    }[];
    expect(listed.filter((l) => l.params.group).map((l) => l.maxUses)).toEqual([1, 5]);
    const [a, b] = active;
    const units = async (name: string, secret: string) => {
      const c = coder(name, secret);
      const seen: string[] = [];
      for (let u = await c.next(); u; u = await c.next()) {
        seen.push(u.externalId);
        await c.submit(u.id, sentiment("positive"));
      }
      return { seen, session: (await c.session()).session };
    };
    expect(await units("ann", a.secret)).toEqual({ seen: ["unit-1"], session: { group: "a" } });
    expect((await units("bo", b.secret)).seen).toEqual(["unit-2", "unit-3"]);
    // Link a takes one coder
    expect((await send("cy", "/session", {}, { "x-link-secret": a.secret })).status).toBe(403);
  });
});

describe("special units per coder", () => {
  it("count the practice, gold and overlap units of the coder unit assignment's column only", async () => {
    const { data: base } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        units: ["g1", "g2"].map((externalId) => ({ externalId, data: { ...base, sentiment_gold: "neutral" } })),
      }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    await createSet("s1", ["unit-1"]);
    await createSet("_overlap", ["unit-2"]);
    await createSet("_gold", ["g1"]);
    // Another column: its special units aren't the loop's
    await createSet("_gold", ["g1", "g2"], "h");
    await createSet("_overlap", ["unit-3"], "h");
    await redeploy({ units: { overlap: "after", gold: "after", goldCheck: { questions: ["sentiment"] } } }, [
      codersInvite("g"),
    ]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const c = coder("routed", secret);
    const seen: string[] = [];
    for (let unit = await c.next(); unit; unit = await c.next()) {
      seen.push(unit.externalId);
      expect((await c.submit(unit.id, sentiment("positive"))).status).toBe(200);
    }
    expect(seen).toEqual(["unit-1", "unit-2", "g1"]);
    // A coder who never asked for units: not routed, so no special units yet
    await send("idle", "/session", {}, { "x-link-secret": secret, "x-new-session": "1" });
    const coders = (await (
      await server.request("/api/study/1/coders", { headers: adminHeaders })
    ).json()) as CoderProgress[];
    const routed = coders.find((x) => x.finished.main_loop === 3)!;
    expect(routed.special).toEqual({ overlap: { done: 1, total: 1 }, gold: { done: 1, total: 1 } });
    expect(coders.filter((x) => x.id !== routed.id).map((x) => x.special)).toEqual([{}]);
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
    expect(first).toMatchObject({ deployment: "1", title: "A tour of AnnoTinder", ended: null, units: 1 });
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
    expect(await res.json()).toEqual([expect.objectContaining({ deployment: "1", ended: null, units: 0 })]);
    // Someone else's login sees none of them
    const other = await ensureUser(db, "other@uni.nl");
    expect(await (await sessions(await createSession(db, other.id, CODER_LOGIN))).json()).toEqual([]);
  });
});
