import { beforeEach, describe, expect, it } from "vitest";
import { adminEndpoints, researcherEndpoints, type AccountRole } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import {
  createApiKey,
  ensureUser,
  limitsOf,
  loginUser,
  resetIdentities,
  setServerRole,
  type LimitRules,
} from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";
import { emptyDb, query } from "./testDb.js";

// Accounts (docs/accounts.md): account roles, becoming a researcher, limits,
// and the admin API, with API keys and responses checked against the contracts.

let db: Db;
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

/** A server admin's web session: the admin API takes no API keys. */
async function adminSession(email: string): Promise<string> {
  await setServerRole(db, (await ensureUser(db, email)).id, "admin");
  return sessionFor(email);
}

/** A web session whose second factor is too long ago for sensitive actions. */
async function staleSessionFor(email: string): Promise<string> {
  const user = await ensureUser(db, email);
  const authTime = new Date(Date.now() - 60 * 60_000);
  return `session ${await createSession(db, user.id, { mfa: true, authTime, issuer: "https://idp.test" })}`;
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
    const admin = await adminSession("boss@uni.nl");
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
    const admin = await adminSession("boss@uni.nl");
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
    expect(((await call(admin, "listUsers")).data.users as { email: string }[]).map((u) => u.email)).not.toContain(
      "jane@uni.nl",
    );
    // A registered user can't be withdrawn
    const users = (await call(admin, "listUsers")).data.users as { id: number; email: string }[];
    expect(
      (await call(admin, "deleteInvitation", { id: users.find((u) => u.email === "boss@uni.nl")!.id })).status,
    ).toBe(409);
  });
});

describe("identities and invitations (JIT account claiming, safeguards)", () => {
  const login = (sub: string, email: string, mfa = true) =>
    loginUser(db, { iss: "https://idp.test", sub, email, emailVerified: true, mfa }, []);
  const backdate = (email: string, what: "granted" | "login", months: number) =>
    what === "granted"
      ? query(
          db,
          `UPDATE roles SET granted_at = now() - interval '${months} months' WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
          [email],
        )
      : query(
          db,
          `UPDATE users SET last_login_at = now() - interval '${months} months', registered_at = now() - interval '${months + 2} months' WHERE email = $1`,
          [email],
        );

  it("the first login with an invited email claims the invitation: its roles and plan", async () => {
    const admin = await adminSession("boss@uni.nl");
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
    expect((await call(admin, "listUsers")).data.users.find((u: { id: number }) => u.id === invited.id)).toMatchObject({
      invitationExpired: true,
    });
    expect(await login("late", "late@uni.nl")).toMatchObject({ role: "user" });
    expect((await call(admin, "listUsers")).data.users.find((u: { id: number }) => u.id === invited.id)).toMatchObject({
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
      await loginUser(
        db,
        { iss: "https://new-idp.test", sub: "new-sub", email: "jane@uni.nl", emailVerified: true, mfa: true },
        [],
      ),
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
    expect((await call(collKey, "listStudies")).data.studies.map((s: { id: number }) => s.id)).toContain(study.id);
    expect((await call(owner, "getStudyUsers", { id: study.id })).data).toContainEqual({
      email: "coll@uni.nl",
      role: "WRITE",
      pending: false,
      disabled: false,
    });
    // Making a collaborator ADMIN is sensitive: not with an API key
    const adminUsers = [...users.slice(0, 1), { email: "coll@uni.nl", role: "ADMIN" }];
    expect((await call(collKey, "putStudyUsers", { id: study.id }, { users: adminUsers })).status).toBe(403);

    // Who changed a study's users is in their security log; a list that changes nothing isn't
    expect((await call(owner, "putStudyUsers", { id: study.id }, { users })).status).toBe(204);
    const withReader = [users[0], { email: "coll@uni.nl", role: "READ" }, { email: "new@uni.nl", role: "READ" }];
    expect((await call(owner, "putStudyUsers", { id: study.id }, { users: withReader })).status).toBe(204);
    expect((await call(owner, "putStudyUsers", { id: study.id }, { users: users.slice(0, 1) })).status).toBe(204);
    expect(await query(db, "SELECT details FROM security_log WHERE event = 'study_users_changed' ORDER BY id")).toEqual(
      [
        { details: { studyId: study.id, changes: [{ email: "coll@uni.nl", from: null, to: "WRITE" }] } },
        {
          details: {
            studyId: study.id,
            changes: [
              { email: "coll@uni.nl", from: "WRITE", to: "READ" },
              { email: "new@uni.nl", from: null, to: "READ" },
            ],
          },
        },
        {
          details: {
            studyId: study.id,
            changes: [
              { email: "coll@uni.nl", from: "READ", to: null },
              { email: "new@uni.nl", from: "READ", to: null },
            ],
          },
        },
      ],
    );
  });
});

describe("limits", () => {
  it("come from the user's plan, else their domains' (most generous), else the default; then their overrides", async () => {
    const admin = await adminSession("boss@uni.nl");
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

    const users = (await call(admin, "listUsers")).data.users as { id: number; email: string }[];
    const id = users.find((u) => u.email === "r@dept.uni.nl")!.id;
    const updated = await call(admin, "updateUser", { id }, { planId: small.id, limits: { units: 50 } });
    expect(updated.data.effectiveLimits).toMatchObject({ studies: 1, units: 50 });
  });

  it("crowd sign-in: off unless a plan has it on; a domain's plans: on in any; the user's own setting over the plan's", async () => {
    const rules = (
      plans: [number, object][],
      domainPlans: [string, number][] = [],
      defaultPlanId: number | null = null,
    ) => ({
      plans: new Map(plans) as LimitRules["plans"],
      domainPlans: domainPlans.map(([domain, planId]) => ({ domain, planId })),
      defaultPlanId,
    });
    const user = (limits: object = {}, planId: number | null = null) => ({ email: "r@dept.uni.nl", planId, limits });
    const signIn = (...args: Parameters<typeof limitsOf>) => limitsOf(...args).crowdSignIn;
    // No plan at all, or plans that don't say
    expect(signIn(user(), rules([]))).toBe(false);
    expect(signIn(user({}, 1), rules([[1, { studies: 5 }]]))).toBe(false);
    // The user's plan, before their domain's and the default
    expect(signIn(user({}, 1), rules([[1, { crowdSignIn: true }]]))).toBe(true);
    const plans: [number, object][] = [
      [1, { crowdSignIn: false }],
      [2, { crowdSignIn: true }],
    ];
    expect(signIn(user({}, 1), rules(plans, [["uni.nl", 2]], 2))).toBe(false);
    // Their domains' plans: on in any of them, before the default
    expect(signIn(user(), rules(plans, [["dept.uni.nl", 1]], 2))).toBe(false);
    const both: [string, number][] = [
      ["dept.uni.nl", 1],
      ["*.uni.nl", 2],
    ];
    expect(signIn(user(), rules(plans, both, 1))).toBe(true);
    // The default plan
    expect(signIn(user(), rules(plans, [], 2))).toBe(true);
    expect(signIn(user(), rules(plans, [], 1))).toBe(false);
    // Their own setting, either way
    expect(signIn(user({ crowdSignIn: true }, 1), rules(plans))).toBe(true);
    expect(signIn(user({ crowdSignIn: false }, 2), rules(plans))).toBe(false);
  });

  it("crowd sign-in is a plan's setting and a user's own, as the admin API saves them", async () => {
    const admin = await adminSession("boss@uni.nl");
    const made = await call(admin, "createPlan", {}, { name: "Panels", limits: { studies: 3, crowdSignIn: true } });
    expect(made.data.limits).toEqual({ studies: 3, crowdSignIn: true });
    const off = await call(
      admin,
      "updatePlan",
      { id: made.data.id },
      { name: "Panels", limits: { crowdSignIn: false } },
    );
    expect(off.data.limits).toEqual({ crowdSignIn: false });
    expect((await call(admin, "createPlan", {}, { name: "x", limits: { crowdSignIn: "yes" } })).status).toBe(400);
    await call(admin, "updatePlan", { id: made.data.id }, { name: "Panels", limits: { crowdSignIn: true } });

    await keyFor("r@uni.nl", "researcher");
    const users = (await call(admin, "listUsers")).data.users as { id: number; email: string }[];
    const id = users.find((u) => u.email === "r@uni.nl")!.id;
    expect((await call(admin, "updateUser", { id }, { planId: made.data.id })).data.effectiveLimits.crowdSignIn).toBe(
      true,
    );
    const own = await call(admin, "updateUser", { id }, { limits: { crowdSignIn: false } });
    expect(own.data).toMatchObject({ limits: { crowdSignIn: false }, effectiveLimits: { crowdSignIn: false } });
    // Left out of their own limits: the plan's again
    expect((await call(admin, "updateUser", { id }, { limits: {} })).data.effectiveLimits.crowdSignIn).toBe(true);
  });

  it("are enforced when studies and units are added, and units have a size limit", async () => {
    const admin = await adminSession("boss@uni.nl");
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
    const admin = await adminSession("boss@uni.nl");
    const r = await keyFor("r@uni.nl", "researcher");
    const id = ((await call(admin, "listUsers")).data.users as { id: number; email: string }[]).find(
      (u) => u.email === "r@uni.nl",
    )!.id;
    expect((await call(admin, "updateUser", { id }, { blocked: true })).data.blockedAt).not.toBeNull();
    expect((await call(r, "getMe")).status).toBe(401);
    // Not themselves
    const self = ((await call(admin, "listUsers")).data.users as { id: number; email: string }[]).find(
      (u) => u.email === "boss@uni.nl",
    )!.id;
    expect((await call(admin, "updateUser", { id: self }, { blocked: true })).status).toBe(409);
  });

  it("searches users by a part of their address, as written", async () => {
    const admin = await adminSession("boss@uni.nl");
    for (const email of ["a_b@uni.nl", "axb@uni.nl", "100%@uni.nl"]) await ensureUser(db, email);
    const found = async (q: string) => {
      const res = await app.request(`/api/admin/users?q=${encodeURIComponent(q)}`, {
        headers: { cookie: `annotinder_session=${admin.slice(8)}`, "x-annotinder": "1" },
      });
      return ((await res.json()) as { users: { email: string }[] }).users.map((u) => u.email).sort();
    };
    expect(await found("B@UNI")).toEqual(["a_b@uni.nl", "axb@uni.nl"]);
    expect(await found("a_b")).toEqual(["a_b@uni.nl"]);
    expect(await found("%")).toEqual(["100%@uni.nl"]);
  });

  it("an API key is no admin: an admin's key works as a researcher's", async () => {
    const key = await keyFor("boss@uni.nl", "admin");
    expect((await call(key, "getMe")).data).toMatchObject({ role: "researcher" });
    expect((await call(key, "listUsers")).data).toMatchObject({ code: "admin_required" });
    expect((await call(key, "putSettings", {}, {})).status).toBe(403);
    expect((await call(key, "createStudy", {}, { name: "mine" })).status).toBe(201);
  });

  it("changing who is admin needs a recent second factor, whichever way", async () => {
    await adminSession("boss@uni.nl");
    const stale = await staleSessionFor("boss@uni.nl");
    const idOf = async (email: string, role: AccountRole) => {
      const user = await ensureUser(db, email);
      await setServerRole(db, user.id, role);
      return user.id;
    };
    const other = await idOf("other-admin@uni.nl", "admin");
    const researcher = await idOf("r@uni.nl", "researcher");
    const stepUp = async (name: Name, params: Record<string, number>, body: unknown) => {
      const res = await call(stale, name, params, body);
      expect(res.status).toBe(403);
      expect(res.data).toMatchObject({ code: "step_up_required" });
    };
    // Giving and taking the role, by id and by email address
    await stepUp("updateUser", { id: researcher }, { role: "admin" });
    await stepUp("updateUser", { id: other }, { role: "researcher" });
    await stepUp("createUser", {}, { email: "new@uni.nl", role: "admin" });
    await stepUp("createUser", {}, { email: "other-admin@uni.nl", role: "researcher" });
    // Blocking an admin, letting one back in, restoring an admin role the safeguards turned off
    await stepUp("updateUser", { id: other }, { blocked: true });
    await stepUp("updateUser", { id: other }, { blocked: false });
    await stepUp("updateUser", { id: other }, { restoreRoles: true });
    // Withdrawing an invitation to be an admin
    const invited = (
      await call(await sessionFor("boss@uni.nl"), "createUser", {}, { email: "inv@uni.nl", role: "admin" })
    ).data.id as number;
    await stepUp("deleteInvitation", { id: invited }, undefined);
    expect(await query(db, "SELECT count(*)::int AS n FROM roles WHERE role = 'admin'")).toEqual([{ n: 3 }]);
    expect(await query(db, "SELECT count(*)::int AS n FROM users WHERE blocked_at IS NOT NULL")).toEqual([{ n: 0 }]);

    // What changes no admin goes on without
    expect((await call(stale, "updateUser", { id: researcher }, { blocked: true })).status).toBe(200);
    expect((await call(stale, "updateUser", { id: researcher }, { role: "user" })).status).toBe(200);
    expect((await call(stale, "updateUser", { id: other }, { role: "admin", limits: { studies: 3 } })).status).toBe(
      200,
    );
    expect((await call(stale, "createUser", {}, { email: "r2@uni.nl", role: "researcher" })).status).toBe(201);
    // With a recent second factor
    const fresh = await sessionFor("boss@uni.nl");
    expect((await call(fresh, "updateUser", { id: other }, { blocked: true })).status).toBe(200);
    expect((await call(fresh, "createUser", {}, { email: "other-admin@uni.nl", role: "researcher" })).status).toBe(201);
  });

  it("suspends a study: it can be read and deleted, not changed; admins see no study data; everything is logged", async () => {
    const admin = await adminSession("boss@uni.nl");
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
    // Its settings can't be changed either: only deleting goes through on the study itself
    expect((await call(r, "updateStudy", { id: study.id }, { name: "ham" })).data).toMatchObject({
      code: "study_suspended",
    });
    expect((await call(admin, "listUnits", { studyId: study.id })).status).toBe(404);
    // Deleting a study is sensitive: not with the key, in a web session with a recent second factor
    const confirm = { confirm: "spam" };
    expect((await call(r, "deleteStudy", { id: study.id }, confirm)).data).toMatchObject({ code: "not_with_api_key" });
    expect((await call(await sessionFor("r@uni.nl"), "deleteStudy", { id: study.id }, confirm)).status).toBe(204);
    expect(await query(db, "SELECT event, details FROM security_log")).toEqual([
      { event: "study_deleted", details: { studyId: study.id, name: "spam" } },
    ]);

    const log = (await call(admin, "listAdminLog")).data as { action: string }[];
    expect(log.map((e) => e.action)).toContain("suspend study");
  });
});

describe("deleting an account", () => {
  const researcher = async (email: string) => {
    await setServerRole(db, (await ensureUser(db, email)).id, "researcher");
    return sessionFor(email);
  };
  const studyOf = async (session: string, name: string) =>
    (await call(session, "createStudy", {}, { name })).data.id as number;
  const count = async (table: string) =>
    (await query<{ n: number }>(db, `SELECT count(*)::int AS n FROM ${table}`))[0]!.n;

  it("needs a recent second factor and the account's email address, typed", async () => {
    const jane = await researcher("jane@uni.nl");
    const key = await keyFor("jane@uni.nl", "researcher");
    const confirm = { confirm: "jane@uni.nl" };
    expect((await call(key, "deleteAccount", {}, confirm)).data).toMatchObject({ code: "not_with_api_key" });
    expect((await call(await staleSessionFor("jane@uni.nl"), "deleteAccount", {}, confirm)).data).toMatchObject({
      code: "step_up_required",
    });
    expect((await call(jane, "deleteAccount", {}, {})).status).toBe(400);
    const wrong = await call(jane, "deleteAccount", {}, { confirm: "jane@uni.com" });
    expect(wrong.status).toBe(400);
    expect(wrong.data).toMatchObject({ code: "confirmation_mismatch" });
    expect(await count("users")).toBe(1);
  });

  it("deletes the user with their logins, keys and the studies only they have a role in", async () => {
    const jane = await researcher("jane@uni.nl");
    const key = await keyFor("jane@uni.nl", "researcher");
    const other = await researcher("other@uni.nl");
    const mine = await studyOf(jane, "Mine alone");
    const theirs = await studyOf(other, "Theirs");
    expect((await call(jane, "getAccountDeletion")).data).toEqual({
      email: "jane@uni.nl",
      studies: [{ id: mine, name: "Mine alone" }],
      blocking: [],
      lastAdmin: false,
    });
    // As typed: capitals and spaces around it don't matter
    expect((await call(jane, "deleteAccount", {}, { confirm: " Jane@Uni.nl " })).status).toBe(204);
    expect(await query(db, "SELECT email FROM users")).toEqual([{ email: "other@uni.nl" }]);
    expect(await query(db, "SELECT id FROM studies")).toEqual([{ id: theirs }]);
    for (const table of ["sessions", "api_keys"])
      expect(await query(db, `SELECT count(*)::int AS n FROM ${table} WHERE user_id <> 2`)).toEqual([{ n: 0 }]);
    // The session and the key are gone with the account
    expect((await call(jane, "getMe")).status).toBe(401);
    expect((await call(key, "getMe")).status).toBe(401);
  });

  it("is refused while others work in their studies, or a study would be left without an ADMIN", async () => {
    const jane = await researcher("jane@uni.nl");
    const other = await researcher("other@uni.nl");
    const shared = await studyOf(jane, "Shared");
    const alone = await studyOf(jane, "Alone");
    const theirs = await studyOf(other, "Theirs");
    const users = (list: [string, string][]) => ({ users: list.map(([email, role]) => ({ email, role })) });
    const put = (session: string, id: number, list: [string, string][]) =>
      call(session, "putStudyUsers", { id }, users(list));
    await put(jane, shared, [
      ["jane@uni.nl", "ADMIN"],
      ["other@uni.nl", "READ"],
    ]);
    // In the other's study Jane becomes the only ADMIN
    await put(other, theirs, [
      ["other@uni.nl", "ADMIN"],
      ["jane@uni.nl", "ADMIN"],
    ]);
    await put(jane, theirs, [
      ["jane@uni.nl", "ADMIN"],
      ["other@uni.nl", "WRITE"],
    ]);

    expect((await call(jane, "getAccountDeletion")).data).toMatchObject({
      studies: [{ id: alone, name: "Alone" }],
      blocking: [
        { id: shared, name: "Shared", reason: "shared" },
        { id: theirs, name: "Theirs", reason: "last_admin" },
      ],
    });
    const refused = await call(jane, "deleteAccount", {}, { confirm: "jane@uni.nl" });
    expect(refused.status).toBe(409);
    expect(refused.data).toMatchObject({ code: "account_has_studies" });
    expect(await count("studies")).toBe(3);

    // Sorted out: the shared study is hers alone again, the other study has another ADMIN
    await put(jane, shared, [["jane@uni.nl", "ADMIN"]]);
    await put(jane, theirs, [
      ["jane@uni.nl", "ADMIN"],
      ["other@uni.nl", "ADMIN"],
    ]);
    expect((await call(jane, "deleteAccount", {}, { confirm: "jane@uni.nl" })).status).toBe(204);
    expect(await query(db, "SELECT id FROM studies")).toEqual([{ id: theirs }]);
  });

  it("an admin deletes a user's account the same way; the server keeps an admin", async () => {
    const admin = await adminSession("boss@uni.nl");
    const jane = await researcher("jane@uni.nl");
    const study = await studyOf(jane, "Hers");
    const id = (await ensureUser(db, "jane@uni.nl")).id;
    const self = (await ensureUser(db, "boss@uni.nl")).id;
    expect((await call(admin, "getUserDeletion", { id })).data).toMatchObject({
      email: "jane@uni.nl",
      studies: [{ id: study, name: "Hers" }],
    });
    const stale = await staleSessionFor("boss@uni.nl");
    expect((await call(stale, "deleteUser", { id }, { confirm: "jane@uni.nl" })).data).toMatchObject({
      code: "step_up_required",
    });
    expect((await call(admin, "deleteUser", { id }, { confirm: "boss@uni.nl" })).data).toMatchObject({
      code: "confirmation_mismatch",
    });
    expect((await call(admin, "deleteUser", { id: self }, { confirm: "boss@uni.nl" })).status).toBe(409);
    expect((await call(admin, "deleteUser", { id }, { confirm: "jane@uni.nl" })).status).toBe(204);
    expect(await query(db, "SELECT email FROM users")).toEqual([{ email: "boss@uni.nl" }]);
    expect(await count("studies")).toBe(0);
    expect((await call(admin, "listAdminLog")).data[0]).toMatchObject({
      action: "delete user",
      target: "jane@uni.nl",
      details: { studies: [`#${study} Hers`] },
    });

    // The only admin can't delete their own account
    expect((await call(admin, "getAccountDeletion")).data).toMatchObject({ lastAdmin: true });
    expect((await call(admin, "deleteAccount", {}, { confirm: "boss@uni.nl" })).data).toMatchObject({
      code: "last_admin",
    });
    await adminSession("second@uni.nl");
    expect((await call(admin, "deleteAccount", {}, { confirm: "boss@uni.nl" })).status).toBe(204);
  });
});

describe("rate limits", () => {
  it("count a researcher's requests per user, whatever they ask for", async () => {
    app = createApp(db, { rateLimits: { researcher: 3 } });
    const jane = await keyFor("jane@uni.nl", "researcher");
    const other = await keyFor("other@uni.nl", "researcher");
    const study = (await call(jane, "createStudy", {}, { name: "Counted" })).data;
    expect((await call(jane, "getMe")).status).toBe(200);
    // Routes of a study count too
    expect((await call(jane, "getStudy", { id: study.id })).status).toBe(200);
    const refused = await call(jane, "getStudy", { id: study.id });
    expect(refused.status).toBe(429);
    expect(refused.data).toMatchObject({ code: "rate_limited" });
    expect((await call(jane, "getMe")).status).toBe(429);
    // Another user has their own count; a request without valid credentials counts for nobody
    expect((await call(other, "getMe")).status).toBe(200);
    expect((await call("atk_nobody", "getMe")).status).toBe(401);
    expect(await query(db, "SELECT key, count FROM rate_limits WHERE key LIKE 'researcher:%' ORDER BY key")).toEqual([
      { key: "researcher:1", count: 5 },
      { key: "researcher:2", count: 1 },
    ]);
  });
});
