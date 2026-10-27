import { beforeEach, describe, expect, it } from "vitest";
import { researcherEndpoints, type ResearcherEndpointName } from "@annotinder/contracts";
import type { z } from "zod";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser } from "../shared/accounts.js";
import { emptyDb } from "./testDb.js";

// The researcher API the way a script (R, Python) or another system uses it:
// an API key, the endpoint registry from the contracts, and every response
// checked against its contract schema.

let db: Sql;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db); // no development auth: keys only
});

async function keyFor(email: string): Promise<string> {
  return (await createApiKey(db, (await ensureUser(db, email)).id, "test")).key;
}

type Endpoint = (typeof researcherEndpoints)[ResearcherEndpointName];

/**
 * Calls an endpoint by name, as a client generated from the contracts
 * would: path params filled in, the body as JSON. Returns the status and,
 * for a 2xx with a response schema, the body parsed by that schema.
 */
async function call<N extends ResearcherEndpointName>(
  key: string | null,
  name: N,
  params: Record<string, string | number> = {},
  body?: unknown,
  query = "",
): Promise<{ status: number; data: z.output<(typeof researcherEndpoints)[N]["response"]> }> {
  const endpoint: Endpoint = researcherEndpoints[name];
  const path = endpoint.path.replace(/:(\w+)/g, (_, p: string) => String(params[p]));
  const res = await app.request(path + query, {
    method: endpoint.method,
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = res.ok && text ? endpoint.response.parse(JSON.parse(text)) : undefined;
  return { status: res.status, data: data as z.output<(typeof researcherEndpoints)[N]["response"]> };
}

const question = (name: string) => ({
  type: "question",
  name,
  variable: { type: "nominal", question: "?", options: [{ value: "yes" }, { value: "no" }] },
});

/** A job with two units and a one-question loop, deployed; returns its id. */
async function setUpJob(key: string): Promise<{ jobId: number; unitIds: number[]; invite: string }> {
  const job = (await call(key, "createJob", {}, { name: "From R" })).data;
  const units = (
    await call(key, "createUnits", { jobId: job.id }, { units: [{ externalId: "a", data: { text: "one" } }, { externalId: "b", data: { text: "two" } }] })
  ).data;
  const codebook = (
    await call(key, "createCodebook", { jobId: job.id }, {
      items: [
        { type: "unit_loop", name: "loop", units: [{ sources: [{ unitset: "__all__" }] }], layout: { template: "" }, children: [question("q")] },
      ],
    })
  ).data;
  expect((await call(key, "putDeployment", { jobId: job.id }, { codebookId: codebook.id })).status).toBe(200);
  const invite = (await call(key, "createInvite", { jobId: job.id }, { label: "coders" })).data;
  return { jobId: job.id, unitIds: units.map((u) => u.id), invite: invite.secret };
}

/** A coder (own session cookie) who codes every unit of the loop with `answer`. */
async function code(jobId: number, invite: string, answer: string): Promise<void> {
  let cookie = "";
  const send = async (path: string, init: RequestInit = {}) => {
    const res = await app.request(`/d/${jobId}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-annotinder": "1", "x-invite-secret": invite, cookie },
    });
    const [set] = res.headers.getSetCookie();
    if (set) cookie = set.split(";")[0];
    return res;
  };
  for (;;) {
    const unit = (await (await send("/loop/loop/next")).json()) as { id: number } | null;
    if (!unit) return;
    const variables = { q: { done: true, values: [{ value: answer }] } };
    expect((await send("/variables/unit", { method: "POST", body: JSON.stringify({ unitId: unit.id, loop: "loop", variables }) })).status).toBe(204);
  }
}

describe("authentication", () => {
  it("needs an API key; development headers only work when enabled", async () => {
    expect((await call(null, "getMe")).status).toBe(401);
    expect((await call("atk_wrong", "getMe")).status).toBe(401);
    const res = await app.request("/job", { headers: { "x-dev-role": "ADMIN" } });
    expect(res.status).toBe(401);

    const key = await keyFor("Researcher@Uni.nl");
    expect((await call(key, "getMe")).data).toEqual({ email: "researcher@uni.nl" });
  });

  it("manages a researcher's own keys; a revoked key stops working", async () => {
    const key = await keyFor("r@uni.nl");
    const created = await call(key, "createApiKey", {}, { label: "laptop" });
    expect(created.status).toBe(201);
    const second = created.data.key;
    expect(second).toMatch(/^atk_/);
    expect(created.data.prefix).toBe(second.slice(0, created.data.prefix.length));

    const listed = (await call(second, "listApiKeys")).data;
    expect(listed.map((k) => k.label)).toEqual(["test", "laptop"]);
    expect(JSON.stringify(listed)).not.toContain(second); // never the key itself
    expect(listed[0].lastUsed).not.toBeNull(); // used above

    expect((await call(key, "revokeApiKey", { id: created.data.id })).data.revokedAt).not.toBeNull();
    expect((await call(second, "getMe")).status).toBe(401);
    expect((await call(key, "getMe")).status).toBe(200);
    // Not someone else's key
    const other = await keyFor("other@uni.nl");
    expect((await call(other, "revokeApiKey", { id: listed[0].id })).status).toBe(404);
  });
});

describe("jobs and roles", () => {
  it("makes the creator ADMIN, and shows each researcher only their jobs", async () => {
    const alice = await keyFor("alice@uni.nl");
    const bob = await keyFor("bob@uni.nl");
    const { jobId } = await setUpJob(alice);

    expect((await call(alice, "listJobs")).data.map((j) => j.id)).toEqual([jobId]);
    expect((await call(bob, "listJobs")).data).toEqual([]);
    expect((await call(bob, "getJob", { id: jobId, jobId })).status).toBe(403);
    expect((await call(alice, "getJob", { id: 999, jobId: 999 })).status).toBe(404);

    // Alice gives Bob read access: he can download, not publish.
    const users = [
      { email: "alice@uni.nl", role: "ADMIN" },
      { email: "bob@uni.nl", role: "READ" },
    ];
    expect((await call(alice, "putJobUsers", { id: jobId, jobId }, { users })).status).toBe(204);
    expect((await call(bob, "listJobs")).data.map((j) => j.id)).toEqual([jobId]);
    expect((await call(bob, "listAnnotations", { jobId })).status).toBe(200);
    expect((await call(bob, "putDeployment", { jobId }, { codebookId: 1 })).status).toBe(403);
  });
});

describe("downloading annotations", () => {
  it("pages through every value in the order written, with unit and coder ids", async () => {
    const key = await keyFor("r@uni.nl");
    const { jobId, unitIds, invite } = await setUpJob(key);
    await code(jobId, invite, "yes");
    await code(jobId, invite, "no");

    const rows = [];
    let after: number | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=3${after !== null ? `&after=${after}` : ""}`;
      const page = (await call(key, "listAnnotations", { jobId }, undefined, query)).data;
      rows.push(...page.annotations);
      after = page.next;
      pages++;
    } while (after !== null);

    expect(pages).toBe(2);
    expect(rows).toHaveLength(4); // 2 coders x 2 units x 1 variable
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => a - b));
    expect(new Set(rows.map((r) => r.unitId))).toEqual(new Set(unitIds));
    expect(rows.map((r) => r.externalId).sort()).toEqual(["a", "a", "b", "b"]);
    expect(rows.filter((r) => r.value.values?.[0].value === "no")).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty("retiredAt");

    // Coder-level values and progress come with the coders.
    const coders = (await call(key, "listCoders", { jobId })).data;
    expect(coders.map((c) => c.finished.loop)).toEqual([2, 2]);
    expect(coders[0].variables).toEqual({});
  });

  it("leaves out reset values unless asked for", async () => {
    const key = await keyFor("r@uni.nl");
    const { jobId, unitIds, invite } = await setUpJob(key);
    await code(jobId, invite, "yes");
    const reset = await call(key, "resetAnnotations", { jobId }, { variables: ["q"], unitIds: [unitIds[0]] });
    expect(reset.data).toEqual({ retired: 1 });

    expect((await call(key, "listAnnotations", { jobId })).data.annotations.map((r) => r.unitId)).toEqual([unitIds[1]]);
    const all = (await call(key, "listAnnotations", { jobId }, undefined, "?retired=true")).data.annotations;
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.unitId === unitIds[0])?.retiredAt).toBeInstanceOf(Date);
    expect(all.find((r) => r.unitId === unitIds[1])?.retiredAt).toBeNull();

    expect((await call(key, "listAnnotations", { jobId }, undefined, "?limit=0")).status).toBe(400);
  });
});
