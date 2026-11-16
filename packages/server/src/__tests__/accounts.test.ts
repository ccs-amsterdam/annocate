import { beforeEach, describe, expect, it } from "vitest";
import { adminEndpoints, researcherEndpoints, type AccountRole } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser, loginUser, resetIdentities, setServerRole } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";
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
  await setServerRole(db, user.id, role);
  return (await createApiKey(db, user.id, "test")).key;
}

/** A web session with a recent second factor (as after a step-up login): for sensitive actions (researcher/auth.ts). */
async function sessionFor(email: string): Promise<string> {
  const user = await ensureUser(db, email);
  return `session ${await createSession(db, user.id, { mfa: true, authTime: new Date(), issuer: "https://idp.test" })}`;
}

const endpoints = { ...researcherEndpoints, ...adminEndpoints };
type Name = keyof typeof endpoints;

async function call(key: string, name: Name, params: Record<string, string | number> = {}, body?: unknown) {
  const endpoint = endpoints[name];
  const path = endpoint.path.replace(/:(\w+)/g, (_, p: string) => encodeURIComponent(String(params[p])));
  const res = await app.request(`/api${path}`, {
    method: endpoint.method,
    headers: {
      "content-type": "application/json",
      ...(key.startsWith("session ")
        ? { cookie: `annotinder_session=${key.slice(8)}`, "x-annotinder": "1" }
        : { authorization: `Bearer ${key}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any =
    res.ok && json !== undefined ? (endpoint.response as { parse(v: unknown): unknown }).parse(json) : json;
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
    expect(
      (await call(admin, "decideResearcherRequest", { userId: requests[0].userId }, { approve: true })).status,
    ).toBe(204);
    expect((await call(user, "getMe")).data).toMatchObject({ role: "researcher", researcherRequest: null });

    // Requests can be switched off
    await call(
      admin,
      "putSettings",
      {},
      { ...(await call(admin, "getSettings")).data, registration: { open: false, requests: false } },
    );
    const other = await keyFor("other@gmail.com", "user");
    expect((await call(other, "requestResearcher", {}, {})).status).toBe(403);
  });

  it("invites by email: a shadow user until its first login, withdrawn while unclaimed", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const plan = (await call(admin, "createPlan", {}, { name: "Course", limits: { studies: 1 } })).data;
    const invited = (await call(admin, "createUser", {}, { email: "Jane@Uni.nl", role: "researcher", planId: plan.id }))
      .data;
    // Not registered yet: no role applies until the owner of the address logs in (login.test.ts)
    expect(invited).toMatchObject({
      email: "jane@uni.nl",
      registered: false,
      role: "user",
      invitationExpired: false,
      planId: plan.id,
    });
    // Inviting the same address again is the same invitation
    expect((await call(admin, "createUser", {}, { email: "jane@uni.nl", role: "researcher" })).data.id).toBe(
      invited.id,
    );
    expect((await call(admin, "deleteInvitation", { id: invited.id })).status).toBe(204);
    expect(((await call(admin, "listUsers")).data as { email: string }[]).map((u) => u.email)).not.toContain(
      "jane@uni.nl",
    );
    // A registered user can't be withdrawn
    const users = (await call(admin, "listUsers")).data as { id: number; email: string }[];
    expect(
      (await call(admin, "deleteInvitation", { id: users.find((u) => u.email === "boss@uni.nl")!.id })).status,
    ).toBe(409);
  });
});

describe("identities and invitations (JIT account claiming, safeguards)", () => {
  const login = (sub: string, email: string, mfa = true) =>
    loginUser(db, { iss: "https://idp.test", sub, email, mfa }, []);
  const backdate = (email: string, what: "granted" | "login", months: number) =>
    what === "granted"
      ? db.query(
          `UPDATE roles SET granted_at = now() - interval '${months} months' WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
          [email],
        )
      : db.query(
          `UPDATE users SET last_login_at = now() - interval '${months} months', registered_at = now() - interval '${months + 2} months' WHERE email = $1`,
          [email],
        );

  it("the first login with an invited email claims the invitation: its roles and plan", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const plan = (await call(admin, "createPlan", {}, { name: "Course", limits: { studies: 1 } })).data;
    const invited = (await call(admin, "createUser", {}, { email: "jane@uni.nl", role: "researcher", planId: plan.id }))
      .data;
    const jane = await login("jane-sub", "jane@uni.nl");
    expect(jane).toMatchObject({ id: invited.id, role: "researcher" });
    // The identity is the user now: a new email at the provider is followed, the roles stay
    expect(await login("jane-sub", "jane@other.org")).toMatchObject({
      id: invited.id,
      email: "jane@other.org",
      role: "researcher",
    });
    // Another identity with the old address is someone else
    expect(await login("someone-else", "jane@uni.nl")).toMatchObject({ role: "user" });
  });

  it("an invitation claimed after 3 months gives nothing until an admin restores it", async () => {
    const admin = await sessionFor("boss@uni.nl");
    await setServerRole(db, (await ensureUser(db, "boss@uni.nl")).id, "admin");
    const invited = (await call(admin, "createUser", {}, { email: "late@uni.nl", role: "researcher" })).data;
    await backdate("late@uni.nl", "granted", 4);
    expect((await call(admin, "listUsers")).data.find((u: { id: number }) => u.id === invited.id)).toMatchObject({
      invitationExpired: true,
    });
    expect(await login("late", "late@uni.nl")).toMatchObject({ role: "user" });
    expect((await call(admin, "listUsers")).data.find((u: { id: number }) => u.id === invited.id)).toMatchObject({
      rolesDisabled: 1,
    });
    expect((await call(admin, "updateUser", { id: invited.id }, { restoreRoles: true })).status).toBe(200);
    expect(await login("late", "late@uni.nl")).toMatchObject({ role: "researcher" });
  });

  it("a user back after a year without a second factor is dormant: older roles don't apply", async () => {
    const user = await login("old", "old@uni.nl");
    await setServerRole(db, user.id, "researcher");
    await backdate("old@uni.nl", "granted", 14);
    await backdate("old@uni.nl", "login", 13);
    expect(await login("old", "old@uni.nl", false)).toMatchObject({ role: "user" });
    // With a second factor the roles apply again
    expect(await login("old", "old@uni.nl", true)).toMatchObject({ role: "researcher" });
  });

  it("re-claiming after changing providers: identities forgotten, accounts claimed by email within 3 months", async () => {
    const jane = await login("old-sub", "jane@uni.nl");
    await setServerRole(db, jane.id, "researcher");
    await backdate("jane@uni.nl", "granted", 12);
    expect(await resetIdentities(db)).toEqual({ users: 1, unclaimable: 0 });
    // The new provider's login with the same verified email is the same account, with its roles
    expect(
      await loginUser(db, { iss: "https://new-idp.test", sub: "new-sub", email: "jane@uni.nl", mfa: true }, []),
    ).toMatchObject({
      id: jane.id,
      role: "researcher",
    });
  });

  it("study roles for an email address wait for its owner (pending), and are theirs at login", async () => {
    const owner = await sessionFor("owner@uni.nl");
    await setServerRole(db, (await ensureUser(db, "owner@uni.nl")).id, "researcher");
    const study = (await call(owner, "createStudy", {}, { name: "Shared" })).data;
    const users = [
      { email: "owner@uni.nl", role: "ADMIN" },
      { email: "coll@uni.nl", role: "WRITE" },
    ];
    expect((await call(owner, "putStudyUsers", { id: study.id }, { users })).status).toBe(204);
    expect((await call(owner, "getStudyUsers", { id: study.id })).data).toContainEqual({
      email: "coll@uni.nl",
      role: "WRITE",
      pending: true,
      disabled: false,
    });
    const coll = await login("coll", "coll@uni.nl");
    await setServerRole(db, coll.id, "researcher");
    const collKey = (await createApiKey(db, coll.id, "t")).key;
    expect((await call(collKey, "listStudies")).data.map((s: { id: number }) => s.id)).toContain(study.id);
    expect((await call(owner, "getStudyUsers", { id: study.id })).data).toContainEqual({
      email: "coll@uni.nl",
      role: "WRITE",
      pending: false,
      disabled: false,
    });
    // Making a collaborator ADMIN is sensitive: not with an API key
    const adminUsers = [...users.slice(0, 1), { email: "coll@uni.nl", role: "ADMIN" }];
    expect((await call(collKey, "putStudyUsers", { id: study.id }, { users: adminUsers })).status).toBe(403);
  });
});

describe("limits", () => {
  it("come from the user's plan, else their domains' (most generous), else the default; then their overrides", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const small = (await call(admin, "createPlan", {}, { name: "Small", limits: { studies: 1, units: 10 } })).data;
    const big = (await call(admin, "createPlan", {}, { name: "Big", limits: { studies: 5, units: null } })).data;
    await call(
      admin,
      "putSettings",
      {},
      { registration: { open: false, requests: true }, defaultPlanId: small.id, unitBytes: 4096, answerBytes: 1024 },
    );
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
    await call(
      admin,
      "putSettings",
      {},
      { registration: { open: false, requests: true }, defaultPlanId: plan.id, unitBytes: 2048, answerBytes: 1024 },
    );
    const r = await keyFor("r@uni.nl", "researcher");
    const study = (await call(r, "createStudy", {}, { name: "one" })).data;
    expect((await call(r, "createStudy", {}, { name: "two" })).data).toMatchObject({ code: "limit_reached" });

    const units = (n: number, text = "x") => ({
      units: Array.from({ length: n }, (_, i) => ({ externalId: `u${i}`, data: { text } })),
    });
    expect((await call(r, "createUnits", { studyId: study.id }, units(3))).data).toMatchObject({
      code: "limit_reached",
    });
    expect((await call(r, "createUnits", { studyId: study.id }, units(1, "x".repeat(3000)))).data).toMatchObject({
      code: "unit_too_large",
    });
    expect((await call(r, "createUnits", { studyId: study.id }, units(2))).status).toBe(201);
    // Replacing units adds none
    expect((await call(r, "createUnits", { studyId: study.id }, { ...units(2), overwrite: true })).status).toBe(201);
  });
});

describe("admin", () => {
  it("blocks a user: their API keys stop working", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const r = await keyFor("r@uni.nl", "researcher");
    const id = ((await call(admin, "listUsers")).data as { id: number; email: string }[]).find(
      (u) => u.email === "r@uni.nl",
    )!.id;
    expect((await call(admin, "updateUser", { id }, { blocked: true })).data.blockedAt).not.toBeNull();
    expect((await call(r, "getMe")).status).toBe(401);
    // Not themselves
    const self = ((await call(admin, "listUsers")).data as { id: number; email: string }[]).find(
      (u) => u.email === "boss@uni.nl",
    )!.id;
    expect((await call(admin, "updateUser", { id: self }, { blocked: true })).status).toBe(409);
  });

  it("suspends a study: it can be read and deleted, not changed; admins see no study data; everything is logged", async () => {
    const admin = await keyFor("boss@uni.nl", "admin");
    const r = await keyFor("r@uni.nl", "researcher");
    const study = (await call(r, "createStudy", {}, { name: "spam" })).data;
    expect((await call(admin, "listAdminStudies")).data).toEqual([
      expect.objectContaining({ id: study.id, owner: "r@uni.nl", units: 0 }),
    ]);
    expect(
      (await call(admin, "updateAdminStudy", { id: study.id }, { suspended: true })).data.suspendedAt,
    ).not.toBeNull();

    expect(
      (await call(r, "createUnits", { studyId: study.id }, { units: [{ externalId: "a", data: {} }] })).data,
    ).toMatchObject({ code: "study_suspended" });
    expect((await call(r, "getStudy", { id: study.id })).data).toMatchObject({ suspendedAt: expect.any(Date) });
    expect((await call(admin, "listUnits", { studyId: study.id })).status).toBe(403);
    // Deleting a study is sensitive: not with the key, in a web session with a recent second factor
    expect((await call(r, "deleteStudy", { id: study.id })).data).toMatchObject({ code: "not_with_api_key" });
    expect((await call(await sessionFor("r@uni.nl"), "deleteStudy", { id: study.id })).status).toBe(204);

    const log = (await call(admin, "listAdminLog")).data as { action: string }[];
    expect(log.map((e) => e.action)).toContain("suspend study");
  });
});
