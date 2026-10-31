import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db.js";
import { emptyDb } from "./testDb.js";
import { createApp } from "../app.js";
import { DbStore } from "../runtime/store.js";
import { HttpError } from "../shared/http.js";
import type { CodebookItem, VariableValue } from "@annotinder/contracts";

let db: Sql;
let app: ReturnType<typeof createApp>;

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are inspected loosely
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devAuth: true });
});

async function createJob(name = "Test job") {
  const res = await app.request("/job", { method: "POST", headers: adminHeaders, body: JSON.stringify({ name }) });
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: number; name: string }>;
}

describe("job routes", () => {
  it("creates and fetches a job", async () => {
    const job = await createJob("My job");
    const res = await app.request(`/job/${job.id}`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe("My job");
  });

  it("allows creating multiple jobs and lists them", async () => {
    const job1 = await createJob("First");
    const job2 = await createJob("Second");
    const res = await app.request("/job", { headers: adminHeaders });
    expect(res.status).toBe(200);
    const jobs = (await json(res)) as { id: number; name: string }[];
    expect(jobs.map((j) => j.id).sort()).toEqual([job1.id, job2.id].sort());
  });

  it("rejects job access without a role header", async () => {
    const job = await createJob();
    const res = await app.request(`/job/${job.id}`);
    expect(res.status).toBe(401);
  });
});

describe("codebook routes", () => {
  it("saves drafts with issues, but only publishes valid codebooks", async () => {
    const job = await createJob();
    const validItems: CodebookItem[] = [
      {
        type: "unit_loop",
        label: "loop",
        units: [{ mode: "all" }],
        layout: { template: "" },
        children: [{ type: "question", name: "q1", variable: { type: "confirm", question: "Confirm?" } }],
      },
    ];
    const post = (items: unknown) =>
      app.request(`/job/${job.id}/codebook`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ items }) });
    const publish = (codebookId: number) =>
      app.request(`/job/${job.id}/deployment`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId }) });

    // Work in progress: a span question outside a loop
    const bad = await post([{ type: "question", name: "q1", variable: { type: "span", question: "?", fields: ["text"], options: [{ value: "x" }] } }]);
    expect(bad.status).toBe(201);
    const draft = await json(bad);
    expect(draft).toMatchObject({ valid: false, revision: 1, updatedBy: "dev@localhost", immutable: false });
    const refused = await publish(draft.id);
    expect(refused.status).toBe(400);
    expect((await json(refused)).issues.length).toBeGreaterThan(0);

    expect((await post("not a list")).status).toBe(400);

    const good = await json(await post(validItems));
    expect(good.valid).toBe(true);
    expect((await publish(good.id)).status).toBe(200);
  });

  it("refuses a save based on an older revision", async () => {
    const job = await createJob();
    const items = [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }];
    const draft = await json(
      await app.request(`/job/${job.id}/codebook`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ items }) }),
    );
    const put = (revision: number | undefined, headers = adminHeaders) =>
      app.request(`/job/${job.id}/codebook/${draft.id}`, { method: "PUT", headers, body: JSON.stringify({ items, revision }) });

    // Jane saves first (revision 1 -> 2)
    const jane = { ...adminHeaders, "x-dev-email": "jane@uni.nl" };
    expect((await json(await put(1, jane))).revision).toBe(2);
    // Our edits were based on revision 1
    const stale = await put(1);
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: "codebook_conflict", updatedBy: "jane@uni.nl", revision: 2 });
    // Overwrite on purpose: without a revision, or with the current one
    expect((await json(await put(2))).revision).toBe(3);
    expect((await json(await put(undefined))).revision).toBe(4);
  });
});

describe("units: fields and pages", () => {
  async function upload(jobId: number, units: object[], overwrite = false) {
    return app.request(`/job/${jobId}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, overwrite }),
    });
  }

  it("takes the fields from the first upload and checks later ones against them", async () => {
    const job = await createJob();
    expect((await upload(job.id, [{ externalId: "u1", data: { n: 1, t: "a" } }])).status).toBe(201);
    const fields = await json(await app.request(`/job/${job.id}/units/fields`, { headers: adminHeaders }));
    expect(fields).toEqual([
      { name: "n", type: "number" },
      { name: "t", type: "text" },
    ]);

    // wrong type, or a missing field: nothing is stored
    const bad = await upload(job.id, [
      { externalId: "u2", data: { n: 2, t: "b" } },
      { externalId: "u3", data: { n: "3", t: "c" } },
    ]);
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatch(/u3.*'n' is number/);
    expect((await upload(job.id, [{ externalId: "u2", data: { n: 2 } }])).status).toBe(400);
    // a new field needs a valid name
    expect((await json(await upload(job.id, [{ externalId: "u2", data: { n: 2, t: "b", "a b": 1 } }]))).error).toMatch(/'a b'/);
    expect(await json(await app.request(`/job/${job.id}/units`, { headers: adminHeaders }))).toHaveLength(1);

    // empty values fit any type
    expect((await upload(job.id, [{ externalId: "u2", data: { n: null, t: "b" } }])).status).toBe(201);

    // a later upload may add fields; the units already stored have no value for them
    expect((await upload(job.id, [{ externalId: "u3", data: { n: 3, t: "c", ok: true } }])).status).toBe(201);
    expect(await json(await app.request(`/job/${job.id}/units/fields`, { headers: adminHeaders }))).toEqual([
      { name: "n", type: "number" },
      { name: "t", type: "text" },
      { name: "ok", type: "boolean" },
    ]);
  });

  it("resets the fields when all units are deleted", async () => {
    const job = await createJob();
    const [unit] = await json(await upload(job.id, [{ externalId: "u1", data: { n: 1 } }]));
    await app.request(`/job/${job.id}/units/${unit.id}`, { method: "DELETE", headers: adminHeaders });
    expect((await upload(job.id, [{ externalId: "u1", data: { other: "x" } }])).status).toBe(201);
  });

  it("pages units, or a set's units in its order", async () => {
    const job = await createJob();
    const units = (await json(
      await upload(job.id, Array.from({ length: 5 }, (_, i) => ({ externalId: `u${i}`, data: { i } }))),
    )) as { id: number }[];
    const put = await app.request(`/job/${job.id}/sets/batch`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ sets: [{ name: "set", unitIds: [units[4].id, units[0].id, units[2].id], ordered: true }, { name: "_overlap", unitIds: [units[1].id] }] }),
    });
    expect(put.status).toBe(200);
    expect(await json(put)).toEqual({
      name: "batch",
      sets: [
        { name: "_overlap", unitIds: [units[1].id], ordered: false },
        { name: "set", unitIds: [units[4].id, units[0].id, units[2].id], ordered: true },
      ],
    });
    const page = async (query: string) =>
      json(await app.request(`/job/${job.id}/units/page?${query}`, { headers: adminHeaders }));

    const all = await page("offset=1&limit=2");
    expect(all.total).toBe(5);
    expect(all.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u1", "u2"]);
    const set = await page("group=batch&set=set&offset=1&limit=5");
    expect(set.total).toBe(3);
    expect(set.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u0", "u2"]);
    expect((await json(await app.request(`/job/${job.id}/overview`, { headers: adminHeaders }))).groups).toEqual([
      { name: "batch", sets: [{ name: "_overlap", units: 1 }, { name: "set", units: 3 }] },
    ]);
    // Deleted: gone (no codebook uses it)
    expect((await app.request(`/job/${job.id}/sets/batch`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);
    expect(await json(await app.request(`/job/${job.id}/sets`, { headers: adminHeaders }))).toEqual([]);
  });

  it("keeps sets to the job's own units, with valid names", async () => {
    const job = await createJob();
    const other = await createJob("Other");
    const [mine] = await json(await upload(job.id, [{ externalId: "u1", data: { n: 1 } }]));
    const [theirs] = await json(await upload(other.id, [{ externalId: "u1", data: { n: 1 } }]));
    const put = (group: string, sets: object[]) =>
      app.request(`/job/${job.id}/sets/${group}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ sets }) });
    expect((await put("g", [{ name: "s", unitIds: [mine.id, theirs.id] }])).status).toBe(400);
    expect((await put("g", [{ name: "_other", unitIds: [mine.id] }])).status).toBe(400);
    expect((await put("g", [{ name: "s", unitIds: [mine.id] }, { name: "s", unitIds: [] }])).status).toBe(400);
    expect((await put("_g", [{ name: "s", unitIds: [mine.id] }])).status).toBe(400);
    expect((await put("g", [{ name: "s", unitIds: [mine.id] }])).status).toBe(200);
  });
});

/** The status a store call would answer with: 200, or its HttpError's. */
async function status(call: Promise<unknown>): Promise<number> {
  try {
    await call;
    return 200;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

describe("annotations: finished counts and resets", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, values: [{ value: code }] });

  async function setup() {
    const job = await createJob();
    const store = new DbStore(db, job.id);
    const units = (await json(
      await app.request(`/job/${job.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data: {} }, { externalId: "u2", data: {} }] }),
      }),
    )) as { id: number }[];
    await db.query("INSERT INTO invites (job_id, label, auth, secret) VALUES ($1, 'x', 'none', 'annotations-link')", [job.id]);
    const { coder } = await store.resolveCoder({ coderKey: "k", inviteSecret: "annotations-link" });
    const put = (unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, coderId: coder.coderId, variables });
    const finished = (variables: string[], values?: string[]) => store.listFinished({ loops: [{ loop: "l", variables, values }] });
    return { job, units, coder, put, finished };
  }

  it("counts a unit as finished only when every given variable is live", async () => {
    const { units, put, finished } = await setup();
    await put(units[0].id, { q1: value("a"), q2: value("b") });
    await put(units[1].id, { q1: value("a") });

    expect((await finished(["q1", "q2"])).map((f) => f.unitId)).toEqual([units[0].id]);
    expect((await finished(["q1"])).map((f) => f.unitId)).toEqual([units[0].id, units[1].id]);
    // a question added later: nothing is finished until it is answered
    expect(await finished(["q1", "q2", "q3"])).toEqual([]);
    // values of requested variables come along
    expect((await finished(["q1", "q2"], ["q2"]))[0].values).toMatchObject({ q2: value("b") });
  });

  it("upserts per variable and keeps variables that weren't sent", async () => {
    const { units, put, finished } = await setup();
    await put(units[0].id, { old: value("x"), q1: value("a") });
    await put(units[0].id, { q1: value("b") });
    const rows = await db.query<{ variable: string; value: VariableValue }>(
      "SELECT variable, value FROM annotation_values WHERE retired_at IS NULL ORDER BY variable",
    );
    expect(rows.map((r) => [r.variable, r.value.values?.[0].value])).toEqual([
      ["old", "x"],
      ["q1", "b"],
    ]);
    expect(await finished(["q1"])).toHaveLength(1);
  });

  it("resets by retiring values: they stay, but no longer count", async () => {
    const { job, units, put, finished } = await setup();
    await app.request(`/job/${job.id}/deployment`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId: 1 }) });
    await put(units[0].id, { q1: value("a") });
    await put(units[1].id, { q1: value("a") });

    const res = await app.request(`/job/${job.id}/annotations/reset`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["q1"], unitIds: [units[0].id] }),
    });
    expect(await json(res)).toEqual({ retired: 1 });
    expect((await finished(["q1"])).map((f) => f.unitId)).toEqual([units[1].id]);
    // recoded after the reset: a new live row next to the retired one
    await put(units[0].id, { q1: value("b") });
    expect(await db.query("SELECT COUNT(*)::int AS n FROM annotation_values WHERE unit_id = $1", [units[0].id])).toEqual([{ n: 2 }]);
    expect(await finished(["q1"])).toHaveLength(2);
  });
});

describe("links, coder progress and overview", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, values: [{ value: code }] });

  async function setup(session?: object) {
    const job = await createJob();
    const store = new DbStore(db, job.id);
    const units = (await json(
      await app.request(`/job/${job.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data: {} }, { externalId: "u2", data: {} }] }),
      }),
    )) as { id: number }[];
    const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
    const loop = { type: "unit_loop", label: "l", units: [{ mode: "all" }], layout: { template: "" }, children: [question("q1"), question("q2")] };
    const publish = async (items: object[], confirmLinks?: boolean) => {
      const codebook = await json(await app.request(`/job/${job.id}/codebook`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ items }) }));
      return app.request(`/job/${job.id}/deployment`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId: codebook.id, confirmLinks }) });
    };
    expect((await publish(session ? [session, loop] : [loop])).status).toBe(200);
    const resolve = async (coderKey: string, inviteSecret: string) => (await store.resolveCoder({ coderKey, inviteSecret })).coder;
    const put = (coderId: number, unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, coderId, variables });
    const get = async (path: string) => json(await app.request(`/job/${job.id}${path}`, { headers: adminHeaders }));
    return { job, units, loop, publish, resolve, put, get };
  }
  const batches = (values: string[]) => ({ type: "session", params: [{ name: "batch", kind: "link", values: { list: values.map((value) => ({ value })) } }] });

  it("makes a link per link parameter value; links are revoked, renewed or retired, never deleted", async () => {
    const { job, loop, publish, resolve, get } = await setup(batches(["used", "unused"]));
    const links = await get("/invites");
    expect(links.map((i: { label: string; params: object }) => [i.label, i.params])).toEqual([
      ["used", { batch: "used" }],
      ["unused", { batch: "unused" }],
    ]);
    const [used, unused] = links;
    expect(await status(resolve("a", used.secret))).toBe(200);
    expect((await get("/invites"))[0].uses).toBe(1);

    // Access settings
    const updated = await json(
      await app.request(`/job/${job.id}/invites/${unused.id}`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ label: "Panel", auth: "none", maxUses: 1 }),
      }),
    );
    expect(updated).toMatchObject({ label: "Panel", maxUses: 1, params: { batch: "unused" } });
    expect(await status(resolve("u1", unused.secret))).toBe(200);
    expect(await status(resolve("u2", unused.secret))).toBe(401);

    // A new secret: the old one stops working
    const renewed = await json(await app.request(`/job/${job.id}/invites/${used.id}/secret`, { method: "POST", headers: adminHeaders }));
    expect(renewed.secret).not.toBe(used.secret);
    expect(await status(resolve("b", used.secret))).toBe(401);

    const revoked = await json(await app.request(`/job/${job.id}/invites/${used.id}/revoke`, { method: "POST", headers: adminHeaders }));
    expect(revoked.revokedAt).not.toBeNull();
    expect(await status(resolve("c", renewed.secret))).toBe(401);
    // coders who already started keep their access
    expect(await status(resolve("a", used.secret))).toBe(200);

    // Republished with other values: "unused" is retired, "new" made; "used" keeps its row
    expect((await publish([batches(["used", "new"]), loop])).status).toBe(200);
    const after = await get("/invites");
    expect(after.map((i: { params: { batch: string }; retiredAt: string | null }) => [i.params.batch, i.retiredAt === null])).toEqual([
      ["used", true],
      ["new", true],
      ["unused", false],
    ]);
    expect(await status(resolve("d", unused.secret))).toBe(403);
  });

  it("asks to confirm many links, and refuses too many", async () => {
    const { loop, publish } = await setup();
    const many = (n: number) => batches(Array.from({ length: n }, (_, i) => `b${i}`));
    const confirm = await publish([many(501), loop]);
    expect(confirm.status).toBe(409);
    expect(await json(confirm)).toMatchObject({ code: "confirm_links" });
    expect((await publish([many(2001), loop], true)).status).toBe(400);
    const ok = await publish([many(501), loop], true);
    expect(ok.status).toBe(200);
    expect((await json(ok)).links).toBe(501);
  });

  it("reports coder progress and the overview from live answers", async () => {
    const { units, resolve, put, get } = await setup(batches(["batch 1"]));
    const [invite] = await get("/invites");
    const coderA = await resolve("a", invite.secret);
    await resolve("b", invite.secret);
    await put(coderA.coderId, units[0].id, { q1: value("x"), q2: value("y") });
    await put(coderA.coderId, units[1].id, { q1: value("x") });

    const coders = await get("/coders");
    expect(coders[0]).toMatchObject({ inviteLabel: "batch 1", answers: 3, finished: { l: 1 } });
    expect(coders[0].lastActive).not.toBeNull();
    expect(coders[1]).toMatchObject({ answers: 0, lastActive: null, finished: { l: 0 } });

    const overview = await get("/overview");
    expect(overview).toMatchObject({
      units: 2,
      coders: { total: 2, started: 1, activeLastDay: 1 },
      answers: 3,
      codings: 1,
    });
    expect(overview.activity).toHaveLength(30);
    expect(overview.activity.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), answers: 3, coders: 1 });
  });
});

describe("security headers", () => {
  it("sends nosniff, a referrer policy and no framing by others; a CSP on pages; HSTS over HTTPS", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull(); // JSON: no policy needed

    const { contentSecurityPolicy } = await import("../shared/securityHeaders.js");
    const csp = contentSecurityPolicy({ frameAncestors: ["https://amcat.example"] });
    expect(csp).toContain("frame-ancestors 'self' https://amcat.example");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-");

    // The client's pages get the policy
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "client-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>x</title>");
    const page = await createApp(db, { clientDir: dir }).request("/some/page");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-frame-options")).toBe("SAMEORIGIN");

    const secure = createApp(db, { https: true });
    expect((await secure.request("/health")).headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});

describe("rate limits", () => {
  it("count per kind and address (or account) per minute, in the database; 429 with Retry-After", async () => {
    const limited = createApp(db, { devAuth: true, rateLimits: { coderStart: 2, researcher: 3 } });
    const start = () => limited.request("/d/1/session", { headers: { "x-annotinder": "1", "x-invite-secret": "nope" } });
    expect((await start()).status).not.toBe(429); // refused for other reasons (no such job), but counted
    expect((await start()).status).not.toBe(429);
    const third = await start();
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("60");
    expect(await third.json()).toMatchObject({ code: "rate_limited" });
    // A browser with a session cookie isn't starting one: not counted
    expect((await limited.request("/d/1/session", { headers: { "x-annotinder": "1", cookie: "annotinder_device=x" } })).status).not.toBe(429);

    const me = () => limited.request("/job", { headers: adminHeaders });
    for (let i = 0; i < 3; i++) expect((await me()).status).toBe(200);
    expect((await me()).status).toBe(429);
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM rate_limits");
    expect(n).toBeGreaterThan(0);
  });
});
