import { beforeEach, describe, expect, it } from "vitest";
import { adminEndpoints, researcherEndpoints, type AccountRole } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser } from "../shared/accounts.js";
import { emptyDb } from "./testDb.js";

// Accounts (docs/accounts.md): account roles, becoming a researcher, limits,
// and the admin API, with API keys and responses checked against the contracts.

let db: Sql;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db);
});

async function keyFor(email: string, role: AccountRole): Promise<string> {
  const user = await ensureUser(db, email);
  await db.query("UPDATE users SET role = $1 WHERE id = $2", [role, user.id]);
  return (await createApiKey(db, user.id, "test", true)).key;
}

const endpoints = { ...researcherEndpoints, ...adminEndpoints };
type Name = keyof typeof endpoints;

async function call(key: string, name: Name, params: Record<string, string | number> = {}, body?: unknown) {
  const endpoint = endpoints[name];
  const path = endpoint.path.replace(/:(\w+)/g, (_, p: string) => encodeURIComponent(String(params[p])));
  const res = await app.request(`/api${path}`, {
    method: endpoint.method,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = res.ok && json !== undefined ? (endpoint.response as { parse(v: unknown): unknown }).parse(json) : json;
  return { status: res.status, data };
}

describe("account roles", () => {
  it("only admins use the admin API; only researchers create studies", async () => {
    const user = await keyFor("student@gmail.com", "user");
    const researcher = await keyFor("r@uni.nl", "researcher");
    expect((await call(researcher, "getSettings")).status).toBe(403);
    expect((await call(user, "createStudy", {}, { name: "x" })).data).toMatchObject({ code: "researcher_required" });
    expect((await call(researcher, "createStudy", {}, { name: "x" })).status).toBe(201);
  });

  it("a user asks to become a researcher; an admin approves", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const user = await keyFor("student@gmail.com", "user");
    const asked = await call(user, "requestResearcher", {}, { message: "PhD at UvA" });
    expect(asked.data).toMatchObject({ role: "user", researcherRequest: { at: expect.any(Date) } });
    const requests = (await call(admin, "listResearcherRequests")).data;
    expect(requests).toEqual([expect.objectContaining({ email: "student@gmail.com", message: "PhD at UvA" })]);
    expect((await call(admin, "decideResearcherRequest", { userId: requests[0].userId }, { approve: true })).status).toBe(204);
    expect((await call(user, "getMe")).data).toMatchObject({ role: "researcher", researcherRequest: null });

    // Requests can be switched off
    await call(admin, "putSettings", {}, { ...(await call(admin, "getSettings")).data, registration: { open: false, requests: false } });
    const other = await keyFor("other@gmail.com", "user");
    expect((await call(other, "requestResearcher", {}, {})).status).toBe(403);
  });

  it("a researcher invite link makes a researcher, once, with its plan", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const plan = (await call(admin, "createPlan", {}, { name: "Course", limits: { studies: 1 } })).data;
    const invite = (await call(admin, "createResearcherInvite", {}, { label: "Jane", planId: plan.id })).data;
    const jane = await keyFor("jane@gmail.com", "user");
    expect((await call(jane, "redeemResearcherInvite", {}, { secret: invite.secret })).data).toMatchObject({ role: "researcher", limits: { studies: 1 } });
    const bob = await keyFor("bob@gmail.com", "user");
    expect((await call(bob, "redeemResearcherInvite", {}, { secret: invite.secret })).status).toBe(404);
    expect((await call(admin, "listResearcherInvites")).data[0]).toMatchObject({ usedBy: "jane@gmail.com" });
  });
});

describe("limits", () => {
  it("come from the user's plan, else their domains' (most generous), else the default; then their overrides", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const small = (await call(admin, "createPlan", {}, { name: "Small", limits: { studies: 1, units: 10 } })).data;
    const big = (await call(admin, "createPlan", {}, { name: "Big", limits: { studies: 5, units: null } })).data;
    await call(admin, "putSettings", {}, { registration: { open: false, requests: true }, defaultPlanId: small.id, unitBytes: 4096, answerBytes: 1024 });
    const r = await keyFor("r@dept.uni.nl", "researcher");
    expect((await call(r, "getMe")).data.limits).toMatchObject({ studies: 1, units: 10 });

    await call(admin, "putDomain", { domain: "*.uni.nl" }, { researcher: false, planId: big.id });
    expect((await call(r, "getMe")).data.limits).toMatchObject({ studies: 5, units: null });

    const users = (await call(admin, "listUsers")).data as { id: number; email: string }[];
    const id = users.find((u) => u.email === "r@dept.uni.nl")!.id;
    const updated = await call(admin, "updateUser", { id }, { planId: small.id, limits: { units: 50 } });
    expect(updated.data.effectiveLimits).toMatchObject({ studies: 1, units: 50 });
  });

  it("are enforced when studies and units are added, and units have a size limit", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const plan = (await call(admin, "createPlan", {}, { name: "Tiny", limits: { studies: 1, unitsPerStudy: 2 } })).data;
    await call(admin, "putSettings", {}, { registration: { open: false, requests: true }, defaultPlanId: plan.id, unitBytes: 2048, answerBytes: 1024 });
    const r = await keyFor("r@uni.nl", "researcher");
    const study = (await call(r, "createStudy", {}, { name: "one" })).data;
    expect((await call(r, "createStudy", {}, { name: "two" })).data).toMatchObject({ code: "limit_reached" });

    const units = (n: number, text = "x") => ({ units: Array.from({ length: n }, (_, i) => ({ externalId: `u${i}`, data: { text } })) });
    expect((await call(r, "createUnits", { studyId: study.id }, units(3))).data).toMatchObject({ code: "limit_reached" });
    expect((await call(r, "createUnits", { studyId: study.id }, units(1, "x".repeat(3000)))).data).toMatchObject({ code: "unit_too_large" });
    expect((await call(r, "createUnits", { studyId: study.id }, units(2))).status).toBe(201);
    // Replacing units adds none
    expect((await call(r, "createUnits", { studyId: study.id }, { ...units(2), overwrite: true })).status).toBe(201);
  });
});

describe("admin", () => {
  it("blocks a user: their API keys stop working", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const r = await keyFor("r@uni.nl", "researcher");
    const id = ((await call(admin, "listUsers")).data as { id: number; email: string }[]).find((u) => u.email === "r@uni.nl")!.id;
    expect((await call(admin, "updateUser", { id }, { blocked: true })).data.blockedAt).not.toBeNull();
    expect((await call(r, "getMe")).status).toBe(401);
    // Not themselves
    const self = ((await call(admin, "listUsers")).data as { id: number; email: string }[]).find((u) => u.email === "boss@uni.nl")!.id;
    expect((await call(admin, "updateUser", { id: self }, { blocked: true })).status).toBe(409);
  });

  it("suspends a study: it can be read and deleted, not changed; admins see no study data; everything is logged", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const r = await keyFor("r@uni.nl", "researcher");
    const study = (await call(r, "createStudy", {}, { name: "spam" })).data;
    expect((await call(admin, "listAdminStudies")).data).toEqual([expect.objectContaining({ id: study.id, owner: "r@uni.nl", units: 0 })]);
    expect((await call(admin, "updateAdminStudy", { id: study.id }, { suspended: true })).data.suspendedAt).not.toBeNull();

    expect((await call(r, "createUnits", { studyId: study.id }, { units: [{ externalId: "a", data: {} }] })).data).toMatchObject({ code: "study_suspended" });
    expect((await call(r, "getStudy", { id: study.id })).data).toMatchObject({ suspendedAt: expect.any(Date) });
    expect((await call(admin, "listUnits", { studyId: study.id })).status).toBe(403);
    expect((await call(r, "deleteStudy", { id: study.id })).status).toBe(204);

    const log = (await call(admin, "listAdminLog")).data as { action: string }[];
    expect(log.map((e) => e.action)).toContain("suspend study");
  });
});
