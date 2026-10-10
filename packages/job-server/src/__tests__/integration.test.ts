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
    next: async (unitset = "main") => {
      const res = await call(`/unitset/${unitset}/next`);
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
    expect((await c.session()).progress).toEqual([{ unitset: "main", doneUnitIds: [first!.id] }]);
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

describe("crowd deployments", () => {
  async function deployCrowd(rule: object) {
    const res = await dbApp.request("/job/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ codebookId: 1, distribution: { main: { mode: "crowd", ...rule } } }),
    });
    expect(res.status).toBe(200);
  }

  it("picks up a redeploy and codes each unit until coders agree", async () => {
    await coder("warmup").session(); // job server has the old (per_coder) version loaded
    await deployCrowd({ agreement: { variable: "sentiment", minAgree: 2, maxCoders: 3 } });

    const answers: Record<string, string> = { a: "positive", b: "negative", c: "positive" };
    const firstUnits: number[] = [];
    for (const key of ["a", "b", "c"]) {
      const c = coder(key);
      const unit = await c.next();
      firstUnits.push(unit!.id);
      expect((await c.submit(unit!.id, sentiment(answers[key]))).status).toBe(204);
    }
    // "fill": everyone gets unit 1 until it reaches agreement (a and c agree on the 3rd coding)
    expect(new Set(firstUnits).size).toBe(1);

    const d = coder("d");
    const unit = await d.next();
    expect(unit!.id).not.toBe(firstUnits[0]);

    const status = (await (await dbApp.request("/job/1/deployment/status", { headers: adminHeaders })).json()) as DeploymentStatus;
    expect(status.version).toBe(2);
    expect(status.unitsets[0]).toMatchObject({ mode: "crowd", completeUnits: 1, leasedUnits: 1, codings: 3 });
  });

  it("refuses annotations for units that were not assigned to the coder", async () => {
    await deployCrowd({ codersPerUnit: 1 });
    const a = coder("a");
    const b = coder("b");
    const unitA = await a.next();
    await b.next();
    expect((await b.submit(unitA!.id, sentiment("neutral"))).status).toBe(409);
  });
});
