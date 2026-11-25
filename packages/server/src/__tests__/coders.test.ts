import { describe, expect, it } from "vitest";
import type { CoderList, CoderResponse, SessionResponse } from "@annotinder/contracts";
import { ensureUser } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";
import { query } from "./testDb.js";
import {
  CODER_LOGIN,
  addCoders,
  adminHeaders,
  coder,
  codersInvite,
  createSet,
  crowd,
  db,
  deployDrafts,
  devices,
  links,
  ownedBy,
  redeploy,
  restart,
  send,
  sentiment,
  server,
  useServer,
} from "./coderHarness.js";

// The study's coders (shared/studyCoders.ts, docs/coder-identity.md §2): the
// `coders` table, the researcher API on it, and what starting a session and
// deleting a coder do to it. On the seeded demo study (three units).

const request = (method: string, path: string, body?: object, headers = adminHeaders) =>
  server.request(`/api/study/1${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const coderList = async (search = "") => (await (await request("GET", `/coders${search}`)).json()) as CoderList;
const byId = async () => new Map((await coderList()).coders.map((c) => [c.coder, c]));
const create = (coders: { coder: string; email?: string }[]) => request("POST", "/coders", { coders });
const refusal = async (res: Response) => ({ status: res.status, ...((await res.json()) as { error: string }) });

/** A crowd whose coder id comes from the URL (`?pid=`). */
const panel = () => redeploy({}, [crowd(undefined, { coderParam: { param: "pid", optional: true } })]);
/** A session from the demo link with these URL parameters. */
const start = (device: string, params = "", headers: Record<string, string> = {}) =>
  send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params, ...headers });

/** Logs a device's browser in, keeping the sessions it has. */
async function logIn(device: string, email: string) {
  const user = await ensureUser(db, email);
  devices.get(device)!.cookies.set("annotinder_session", await createSession(db, user.id, CODER_LOGIN));
}

/** A new device, logged in as this address. */
async function loggedIn(device: string, email: string) {
  const user = await ensureUser(db, email);
  devices.set(device, {
    cookies: new Map([["annotinder_session", await createSession(db, user.id, CODER_LOGIN)]]),
    linkSecret: null,
  });
}

describe("expert coders", () => {
  it("are made by the researchers, with an email address or without; ids are kept as written", async () => {
    const res = await create([{ coder: "Anna de Vries", email: "Anna@Uni.nl" }, { coder: "bob" }]);
    expect(res.status).toBe(201);
    const made = ((await res.json()) as { coders: CoderResponse[] }).coders;
    expect(made.map((c) => [c.coder, c.kind, c.email])).toEqual([
      ["Anna de Vries", "expert", "anna@uni.nl"],
      ["bob", "expert", null],
    ]);
    expect(made[1]).toMatchObject({
      assigned: 0,
      assignedDraft: 0,
      draftDiffers: false,
      done: 0,
      remaining: 0,
      sessions: 0,
      lastActive: null,
    });
    expect((await coderList()).coders.map((c) => c.coder)).toEqual(["Anna de Vries", "bob"]);
  });

  it("need the WRITE role to make or change; READ sees them, with their email addresses", async () => {
    const reader = { ...adminHeaders, "x-dev-role": "READ" };
    expect((await request("POST", "/coders", { coders: [{ coder: "anna" }] }, reader)).status).toBe(403);
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }]);
    expect((await request("PATCH", "/coders/anna", { email: null }, reader)).status).toBe(403);
    const seen = (await (await request("GET", "/coders", undefined, reader)).json()) as CoderList;
    expect(seen.coders.map((c) => c.email)).toEqual(["anna@uni.nl"]);
    const writer = { ...adminHeaders, "x-dev-role": "WRITE" };
    expect((await request("POST", "/coders", { coders: [{ coder: "bob" }] }, writer)).status).toBe(201);
  });

  it("an id that can't be one is refused: empty, too long, padded, with control characters or ; #", async () => {
    for (const coder of ["", "x".repeat(65), " anna", "an\nna", "anna;bob", "anna#2"])
      expect([coder, (await create([{ coder }])).status]).toEqual([coder, 400]);
    expect((await create([{ coder: "anna", email: "not an address" }])).status).toBe(400);
    expect((await coderList()).coders).toEqual([]);
  });

  it("an id given twice or taken (ignoring case) refuses the whole request, naming them", async () => {
    await addCoders(["anna", "bob"]);
    expect(await refusal(await create([{ coder: "carl" }, { coder: "Carl" }, { coder: "dora" }]))).toMatchObject({
      status: 409,
      code: "coder_exists",
      error: "Given twice: Carl",
    });
    expect(await refusal(await create([{ coder: "ANNA" }, { coder: "carl" }, { coder: "Bob" }]))).toMatchObject({
      status: 409,
      error: "Already coders of this study: ANNA, Bob",
    });
    expect((await coderList()).coders.map((c) => c.coder)).toEqual(["anna", "bob"]);
  });

  it("an email address is one coder's in a study (ignoring case)", async () => {
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }]);
    expect(await refusal(await create([{ coder: "bob", email: "Anna@uni.nl" }]))).toMatchObject({
      status: 409,
      error: "Email addresses of other coders already: Anna@uni.nl",
    });
    expect(
      await refusal(
        await create([
          { coder: "bob", email: "b@uni.nl" },
          { coder: "carl", email: "B@uni.nl" },
        ]),
      ),
    ).toMatchObject({ status: 409, error: "Email addresses given twice: B@uni.nl" });
    await query(db, "INSERT INTO studies (name, public_id) VALUES ('other', 'otherstudy01')");
    // Another study's coder may have the same id and address
    const other = await server.request("/api/study/2/coders", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ coders: [{ coder: "anna", email: "anna@uni.nl" }] }),
    });
    expect(other.status).toBe(201);
  });

  it("their email address is set or cleared; the id never changes", async () => {
    await addCoders(["anna", { coder: "bob", email: "bob@uni.nl" }]);
    const patch = (coder: string, email: string | null) =>
      request("PATCH", `/coders/${encodeURIComponent(coder)}`, { email });
    const set = await patch("anna", "Anna@Uni.nl");
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ coder: "anna", email: "anna@uni.nl" });
    expect((await patch("anna", "anna@uni.nl")).status).toBe(200);
    expect(await refusal(await patch("anna", "BOB@uni.nl"))).toMatchObject({ status: 409, code: "coder_exists" });
    expect((await patch("bob", null)).status).toBe(200);
    expect((await byId()).get("bob")!.email).toBeNull();
    expect((await patch("nobody", "n@uni.nl")).status).toBe(404);
    // The id is matched as written
    expect((await patch("Anna", "a@uni.nl")).status).toBe(404);
    expect((await patch("anna", "not an address")).status).toBe(400);
    // An id with characters a path encodes
    await addCoders(["team/Anna de Vries?"]);
    expect(await (await patch("team/Anna de Vries?", "adv@uni.nl")).json()).toMatchObject({
      coder: "team/Anna de Vries?",
      email: "adv@uni.nl",
    });
  });
});

describe("the list of coders", () => {
  it("comes in pages, in the order the coders were made, of one kind when asked", async () => {
    await panel();
    await addCoders(["anna", "bob", "carl"]);
    expect((await start("p1", "pid=P1")).status).toBe(200);
    const first = await coderList("?limit=2");
    expect(first.coders.map((c) => c.coder)).toEqual(["anna", "bob"]);
    const rest = await coderList(`?limit=2&after=${first.next}`);
    expect(rest.coders.map((c) => c.coder)).toEqual(["carl", "P1"]);
    expect(rest.next).toBeUndefined();
    expect((await coderList("?kind=expert")).coders.map((c) => c.coder)).toEqual(["anna", "bob", "carl"]);
    expect((await coderList("?kind=crowd")).coders.map((c) => c.coder)).toEqual(["P1"]);
    expect((await request("GET", "/coders?kind=panel")).status).toBe(400);
  });

  it("counts each expert coder's units: deployed, in the draft, answered and still to do", async () => {
    await createSet("anna", ["unit-1", "unit-2"], "coder_set");
    await createSet("bob", ["unit-3"], "coder_set");
    await redeploy({}, [codersInvite()]);
    const secrets = Object.fromEntries(
      (await links()).filter((l) => !l.retiredAt).map((l) => [l.params.coder, l.secret]),
    );
    const anna = coder("anna", secrets.anna);
    const unit = (await anna.next())!;
    expect((await anna.submit(unit.id, sentiment("positive"))).status).toBe(200);
    // The draft gives bob another unit and takes one from anna; carl is new
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("bob", ["unit-3", "unit-2"], "coder_set");
    await addCoders(["carl"]);

    const coders = await byId();
    expect(coders.get("anna")).toMatchObject({
      assigned: 2,
      assignedDraft: 1,
      draftDiffers: true,
      done: 1,
      remaining: 1,
      sessions: 1,
    });
    expect(coders.get("anna")!.lastActive).not.toBeNull();
    expect(coders.get("bob")).toMatchObject({
      assigned: 1,
      assignedDraft: 2,
      draftDiffers: true,
      done: 0,
      remaining: 1,
    });
    expect(coders.get("carl")).toMatchObject({ assigned: 0, assignedDraft: 0, draftDiffers: false, sessions: 0 });
    // Deployed: the draft is what coders have
    await deployDrafts();
    expect((await byId()).get("bob")).toMatchObject({
      assigned: 2,
      assignedDraft: 2,
      draftDiffers: false,
      remaining: 2,
    });
  });

  it("the same number of units, but other units: the draft differs", async () => {
    await createSet("anna", ["unit-1"], "coder_set");
    await redeploy({}, [codersInvite()]);
    await createSet("anna", ["unit-2"], "coder_set");
    expect((await byId()).get("anna")).toMatchObject({ assigned: 1, assignedDraft: 1, draftDiffers: true });
  });

  it("a crowd's coders have no units of their own; what they answered counts", async () => {
    await panel();
    // The coder id is part of the device's key: every request carries it
    const asP1 = { "x-link-secret": "demo-secret", "x-url-params": "pid=P1" };
    const res = await send("p1", "/loop/loop_1/next", {}, asP1);
    const [unit] = ((await res.json()) as { units: { id: number }[] }).units;
    const body = JSON.stringify({ unitId: unit!.id, variables: sentiment("negative") });
    expect((await send("p1", "/variables/unit", { method: "POST", body }, asP1)).status).toBe(200);
    expect((await byId()).get("P1")).toMatchObject({
      kind: "crowd",
      email: null,
      assigned: null,
      assignedDraft: null,
      remaining: null,
      draftDiffers: false,
      done: 1,
      sessions: 1,
    });
  });

  it("says how many units no expert coder has, deployed and in the draft; test units aside", async () => {
    expect((await coderList()).unassigned).toEqual({ live: 3, draft: 3 });
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("overlap", ["unit-2"], "test_set");
    expect((await coderList()).unassigned).toEqual({ live: 3, draft: 1 });
    await redeploy({}, [codersInvite()]);
    expect((await coderList()).unassigned).toEqual({ live: 1, draft: 1 });
    await createSet("bob", ["unit-3", "unit-1"], "coder_set");
    expect((await coderList()).unassigned).toEqual({ live: 1, draft: 0 });
  });

  it("before the first deploy there are no deployed units to count", async () => {
    await query(db, "INSERT INTO studies (name, public_id) VALUES ('new', 'newstudy0001')");
    const res = await server.request("/api/study/2/coders", { headers: adminHeaders });
    expect(((await res.json()) as CoderList).unassigned).toEqual({ live: null, draft: 0 });
  });
});

describe("the units' coder_set", () => {
  const putSets = (names: string[]) =>
    request("PUT", "/sets/coder_set", { sets: names.map((name) => ({ name, unitIds: [] })) });

  it("names expert coders only: unknown ids are refused, listed", async () => {
    await addCoders(["anna"]);
    expect(await refusal(await putSets(["anna", "bob", "Anna"]))).toMatchObject({
      status: 400,
      code: "unknown_coders",
      error: expect.stringContaining("coders who aren't an expert coder of this study: bob, Anna."),
    });
    expect(await refusal(await putSets(["carl"]))).toMatchObject({
      error: expect.stringContaining("a coder who isn't an expert coder of this study: carl."),
    });
    expect(await query(db, "SELECT name FROM unit_sets WHERE grp = 'coder_set'")).toEqual([]);
    expect((await putSets(["anna"])).status).toBe(200);
  });

  it("doesn't take a crowd's coder", async () => {
    await panel();
    expect((await start("p1", "pid=P1")).status).toBe(200);
    expect((await refusal(await putSets(["P1"]))).status).toBe(400);
  });

  it("a recipe brings its coders; one that names a coder it doesn't have is refused", async () => {
    const recipe = (coders: object[]) =>
      server.request("/api/study/from-recipe", {
        method: "POST",
        headers: { ...adminHeaders, "x-dev-email": "r@uni.nl", "x-dev-account-role": "researcher" },
        body: JSON.stringify({
          name: "From a recipe",
          units: [{ id: "u1", data: { text: "one" } }],
          coders,
          sets: [{ column: "coder_set", sets: [{ name: "anna", units: ["u1"] }] }],
          design: { items: [] },
        }),
      });
    const refused = await recipe([]);
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain("isn't an expert coder of this study: anna");
    const made = await recipe([{ coder: "anna", email: "anna@uni.nl" }]);
    expect(made.status, await made.clone().text()).toBe(201);
    const { id } = (await made.json()) as { id: number };
    const list = (await (
      await server.request(`/api/study/${id}/coders`, { headers: adminHeaders })
    ).json()) as CoderList;
    expect(list.coders.map((c) => [c.coder, c.email, c.assignedDraft])).toEqual([["anna", "anna@uni.nl", 1]]);
  });
});

describe("a crowd's coders", () => {
  const rows = () => query<{ coder: string; kind: string }>(db, "SELECT coder, kind FROM coders ORDER BY id");

  it("are made when a session with a new coder id starts; an anonymous session makes none", async () => {
    await panel();
    expect((await start("anonymous")).status).toBe(200);
    expect(await rows()).toEqual([]);
    expect((await start("p1", "pid=P1")).status).toBe(200);
    expect((await start("p2", "pid=P2")).status).toBe(200);
    expect(await rows()).toEqual([
      { coder: "P1", kind: "crowd" },
      { coder: "P2", kind: "crowd" },
    ]);
    // Another session of a known coder: the same coder
    expect((await start("p1-phone", "pid=P1", { "x-new-session": "1" })).status).toBe(200);
    expect(await rows()).toHaveLength(2);
    expect((await byId()).get("P1")!.sessions).toBe(2);
  });

  it("an id that differs only in case is the same coder, as first written", async () => {
    await panel();
    expect((await start("p1", "pid=Panel-7")).status).toBe(200);
    const again = await start("p2", "pid=PANEL-7");
    expect(await refusal(again)).toMatchObject({ status: 409, code: "coder_has_session" });
    const session = (await (await start("p2", "pid=PANEL-7", { "x-new-session": "1" })).json()) as SessionResponse;
    expect(session.session).toEqual({ coder: "Panel-7" });
    expect(await rows()).toEqual([{ coder: "Panel-7", kind: "crowd" }]);
  });

  it("an id that is one of the study's expert coders is refused, whatever its case", async () => {
    await addCoders(["anna"]);
    await panel();
    for (const pid of ["anna", "ANNA"])
      expect(await refusal(await start(`device-${pid}`, `pid=${pid}`))).toMatchObject({
        status: 409,
        code: "coder_is_expert",
      });
    expect(await query(db, "SELECT id FROM coder_sessions")).toEqual([]);
    expect(await rows()).toEqual([{ coder: "anna", kind: "expert" }]);
  });
});

describe("a session's coder", () => {
  it("is one of the study's coders: the database refuses any other, and deleting the coder deletes the session", async () => {
    const [link] = await query<{ id: number }>(db, "SELECT id FROM links WHERE study_id = 1");
    const insert = (coderId: string | null) =>
      query(db, "INSERT INTO coder_sessions (study_id, link_id, coder) VALUES (1, $1, $2)", [link!.id, coderId]);
    await expect(insert("nobody")).rejects.toThrow();
    await addCoders(["anna"]);
    await insert("anna");
    await insert(null);
    await expect(query(db, "UPDATE coder_sessions SET coder = 'Anna' WHERE coder = 'anna'")).rejects.toThrow();
    await query(db, "DELETE FROM coders WHERE coder = 'anna'");
    expect(await query(db, "SELECT coder FROM coder_sessions")).toEqual([{ coder: null }]);
  });
});

describe("expert coders who sign in", () => {
  const session = async (device: string, secret: string, headers: Record<string, string> = {}) => {
    const res = await send(device, "/session", {}, { "x-link-secret": secret, ...headers });
    return { status: res.status, body: (await res.json()) as SessionResponse & { code?: string } };
  };
  const setUp = async () => {
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }, { coder: "bob", email: "bob@uni.nl" }, "carl"]);
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("bob", ["unit-2"], "coder_set");
    await redeploy({}, [codersInvite("login")]);
    return (await links()).filter((l) => !l.retiredAt)[0]!.secret;
  };

  it("are the coder whose email address the login has; an address that is only a coder id gets nothing", async () => {
    const secret = await setUp();
    await loggedIn("laptop", "Anna@Uni.nl");
    expect((await session("laptop", secret)).body).toMatchObject({ session: { coder: "anna" }, login: "anna@uni.nl" });
    // An expert coder whose id is an address, but who has another address to sign in with
    await addCoders([{ coder: "dora@uni.nl", email: "d.jansen@uni.nl" }]);
    await createSet("dora@uni.nl", ["unit-3"], "coder_set");
    await deployDrafts();
    await loggedIn("id-only", "dora@uni.nl");
    expect(await session("id-only", secret)).toMatchObject({ status: 403, body: { code: "email_not_allowed" } });
    await loggedIn("dora", "d.jansen@uni.nl");
    expect((await session("dora", secret)).body.session).toEqual({ coder: "dora@uni.nl" });
  });

  it("need units: a coder outside the deployed coder set has no access", async () => {
    const secret = await setUp();
    await request("PATCH", "/coders/carl", { email: "carl@uni.nl" });
    await loggedIn("carl", "carl@uni.nl");
    expect(await session("carl", secret)).toMatchObject({ status: 403, body: { code: "email_not_allowed" } });
  });

  it("sign in with the coder's current address; the session keeps the address it started with", async () => {
    const secret = await setUp();
    await loggedIn("laptop", "anna@uni.nl");
    const first = await session("laptop", secret);
    expect(first.status).toBe(200);

    expect((await request("PATCH", "/coders/anna", { email: "a.devries@work.nl" })).status).toBe(200);
    // The old address is no coder's any more
    await loggedIn("old", "anna@uni.nl");
    expect(await session("old", secret)).toMatchObject({ status: 403, body: { code: "email_not_allowed" } });
    // The new one continues the coder's session
    await loggedIn("new", "a.devries@work.nl");
    expect((await session("new", secret)).body.sessionId).toBe(first.body.sessionId);
    expect(await query(db, "SELECT coder, email FROM coder_sessions")).toEqual([
      { coder: "anna", email: "anna@uni.nl" },
    ]);
    // Also on a device that has only the login (no link), when the study isn't in memory (a restart)
    const withoutLink = async (device: string) => {
      useServer(restart());
      const res = await send(device, "/session");
      return { status: res.status, body: (await res.json()) as SessionResponse & { code?: string } };
    };
    await loggedIn("tablet", "A.deVries@work.nl");
    expect(await withoutLink("tablet")).toMatchObject({ status: 200, body: { sessionId: first.body.sessionId } });
    // The old address shows nothing of the study, nor does another coder's who hasn't started
    await loggedIn("old tablet", "anna@uni.nl");
    expect(await withoutLink("old tablet")).toMatchObject({ status: 404, body: { code: "link_not_found" } });
    await loggedIn("bob's", "bob@uni.nl");
    expect(await withoutLink("bob's")).toMatchObject({ status: 404, body: { code: "link_not_found" } });
    // Without an address: nobody signs in as this coder
    expect((await request("PATCH", "/coders/anna", { email: null })).status).toBe(200);
    await loggedIn("later", "a.devries@work.nl");
    expect((await session("later", secret)).status).toBe(403);
  });
});

describe("deleting a coder", () => {
  const remove = async (body: object) => {
    const res = await request("POST", "/coders/delete", body);
    expect(res.status, await res.clone().text()).toBe(200);
    return (await res.json()) as { sessionIds: number[]; answers: number; coders: string[] };
  };
  const coderSets = () =>
    query<{ name: string; live: boolean }>(
      db,
      "SELECT name, live FROM unit_sets WHERE grp = 'coder_set' ORDER BY name, live",
    );
  /** anna and bob with a link each; anna answered a unit. */
  const setUp = async () => {
    await addCoders([{ coder: "anna", email: "anna@uni.nl" }, "bob"]);
    await createSet("anna", ["unit-1", "unit-2"], "coder_set");
    await createSet("bob", ["unit-3"], "coder_set");
    await redeploy({}, [codersInvite()]);
    const secrets = Object.fromEntries(
      (await links()).filter((l) => !l.retiredAt).map((l) => [l.params.coder, l.secret]),
    );
    const anna = coder("anna", secrets.anna);
    const unit = (await anna.next())!;
    expect((await anna.submit(unit.id, sentiment("positive"))).status).toBe(200);
    return { secrets, anna };
  };

  it("removes the coder with their email address, their sessions and answers, and logs the sessions without their units", async () => {
    await setUp();
    const [session] = await query<{ id: number }>(db, "SELECT id FROM coder_sessions");
    expect(await remove({ coders: ["anna"] })).toEqual({
      sessionIds: [Number(session!.id)],
      answers: 1,
      coders: ["anna"],
    });
    expect(await query(db, "SELECT coder, email FROM coders ORDER BY id")).toEqual([{ coder: "bob", email: null }]);
    expect(await query(db, "SELECT id FROM coder_sessions")).toEqual([]);
    expect(await query(db, "SELECT id FROM annotation_values")).toEqual([]);
    const log = (await (await request("GET", "/coders/deletions")).json()) as Record<string, unknown>[];
    expect(log).toEqual([
      {
        sessionId: Number(session!.id),
        coder: "anna",
        requestedAt: null,
        deletedAt: expect.any(String),
        deletedBy: expect.any(String),
        answers: 1,
      },
    ]);
    expect(JSON.stringify(await query(db, "SELECT * FROM session_deletions"))).not.toContain("anna@uni.nl");
  });

  it("takes them out of the draft's and the deployed coder set: their units have no coder", async () => {
    await setUp();
    expect((await coderList()).unassigned).toEqual({ live: 0, draft: 0 });
    await remove({ coders: ["anna"] });
    expect(await coderSets()).toEqual([
      { name: "bob", live: false },
      { name: "bob", live: true },
    ]);
    expect((await coderList()).unassigned).toEqual({ live: 2, draft: 2 });
    // The other coders go on as before
    expect((await byId()).get("bob")).toMatchObject({ assigned: 1, assignedDraft: 1, draftDiffers: false });
  });

  it("deletes their own link: nobody starts as them, and the others' links work", async () => {
    const { secrets } = await setUp();
    await remove({ coders: ["anna"] });
    expect((await links()).filter((l) => !l.retiredAt).map((l) => l.params.coder)).toEqual(["bob"]);
    const again = await send("anna-again", "/session", {}, { "x-link-secret": secrets.anna! });
    expect(await refusal(again)).toMatchObject({ status: 404, code: "link_not_found" });
    // Their browser has no session any more
    expect((await send("anna", "/session", {}, { "x-link-secret": secrets.anna! })).status).toBe(404);
    expect((await send("bob", "/session", {}, { "x-link-secret": secrets.bob! })).status).toBe(200);
  });

  it("the id can be made again: a new coder, without the earlier one's units, sessions or address", async () => {
    await setUp();
    await remove({ coders: ["anna"] });
    expect((await create([{ coder: "anna" }])).status).toBe(201);
    expect((await byId()).get("anna")).toMatchObject({
      email: null,
      assigned: 0,
      assignedDraft: 0,
      done: 0,
      sessions: 0,
    });
  });

  it("a coder made again with the id gets a new link at the next deploy, which works", async () => {
    const { secrets } = await setUp();
    await remove({ coders: ["anna"] });
    await create([{ coder: "anna" }]);
    await createSet("anna", ["unit-2"], "coder_set");
    await deployDrafts();
    const listed = (await links()) as (Awaited<ReturnType<typeof links>>[number] & {
      revokedAt: string | null;
      uses: number;
    })[];
    const now = Object.fromEntries(listed.filter((l) => !l.retiredAt).map((l) => [l.params.coder, l]));
    expect(Object.keys(now).sort()).toEqual(["anna", "bob"]);
    expect(now.anna).toMatchObject({ retiredAt: null, revokedAt: null, uses: 0 });
    expect(now.anna!.secret).not.toBe(secrets.anna);
    expect(now.bob!.secret).toBe(secrets.bob);
    // The new link starts the new coder, with their units and none of the earlier answers
    const anna = coder("anna's new laptop", now.anna!.secret);
    expect((await anna.session()).session.coder).toBe("anna");
    expect((await anna.next())!.externalId).toBe("unit-2");
    // The earlier link stays gone
    const earlier = await send("earlier", "/session", {}, { "x-link-secret": secrets.anna! });
    expect(await refusal(earlier)).toMatchObject({ status: 404, code: "link_not_found" });
  });

  it("works for a coder who never started, and by the email address the researchers gave", async () => {
    await addCoders([{ coder: "carl", email: "carl@uni.nl" }, "dora"]);
    await createSet("dora", ["unit-1"], "coder_set");
    expect(await remove({ emails: ["Carl@uni.nl"] })).toEqual({ sessionIds: [], answers: 0, coders: ["carl"] });
    expect(await remove({ coders: ["dora"] })).toEqual({ sessionIds: [], answers: 0, coders: ["dora"] });
    expect(await coderSets()).toEqual([]);
    expect((await coderList()).coders).toEqual([]);
  });

  it("by session id: an expert coder stays, with their units", async () => {
    await setUp();
    const [session] = await query<{ id: number }>(db, "SELECT id FROM coder_sessions");
    expect(await remove({ sessionIds: [Number(session!.id)] })).toMatchObject({ answers: 1, coders: [] });
    expect((await byId()).get("anna")).toMatchObject({ assigned: 2, done: 0, sessions: 0, email: "anna@uni.nl" });
  });

  it("a crowd's coder goes with their last session", async () => {
    await panel();
    const first = (await (await start("p1", "pid=P1")).json()) as SessionResponse;
    const second = (await (await start("p1-phone", "pid=P1", { "x-new-session": "1" })).json()) as SessionResponse;
    expect(await remove({ sessionIds: [first.sessionId] })).toMatchObject({ coders: [] });
    expect((await byId()).get("P1")!.sessions).toBe(1);
    expect(await remove({ sessionIds: [second.sessionId] })).toMatchObject({ coders: ["P1"] });
    expect((await coderList()).coders).toEqual([]);
  });

  it("a crowd's coder goes with a session that is removed unused: its device moved to its login's session", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    await panel();
    const signIn = { "x-use-login": "1" };
    // P1 signs in on their phone
    const phone = (await (await start("phone", "pid=P1")).json()) as SessionResponse;
    await logIn("phone", "p@example.org");
    expect(((await (await start("phone", "pid=P1", signIn)).json()) as SessionResponse).login).toBe("p@example.org");
    // On a laptop the same person starts as P2, then signs in: the laptop continues the phone's session
    const laptop = (await (await start("laptop", "pid=P2")).json()) as SessionResponse;
    expect(laptop.sessionId).not.toBe(phone.sessionId);
    expect((await coderList()).coders.map((c) => c.coder)).toEqual(["P1", "P2"]);
    await logIn("laptop", "p@example.org");
    const moved = (await (await start("laptop", "pid=P2", signIn)).json()) as SessionResponse;
    expect(moved.sessionId).toBe(phone.sessionId);
    // P2's only session was unused and is gone, and so is P2
    expect(await query(db, "SELECT coder FROM coder_sessions")).toEqual([{ coder: "P1" }]);
    expect(await query(db, "SELECT coder, kind FROM coders")).toEqual([{ coder: "P1", kind: "crowd" }]);
  });

  it("a crowd's coder stays when the session a device left had answers, or they have another session", async () => {
    await ownedBy("owner@example.org", { crowdSignIn: true });
    await panel();
    const signIn = { "x-use-login": "1" };
    await start("phone", "pid=P1");
    await logIn("phone", "p@example.org");
    await start("phone", "pid=P1", signIn);
    // P2 has two sessions: the unused one a device leaves is removed, P2 stays for the other
    await start("tablet", "pid=P2");
    await start("laptop", "pid=P2", { "x-new-session": "1" });
    await logIn("laptop", "p@example.org");
    await start("laptop", "pid=P2", signIn);
    expect(await query(db, "SELECT coder FROM coder_sessions ORDER BY id")).toEqual([{ coder: "P1" }, { coder: "P2" }]);
    expect((await coderList()).coders.map((c) => c.coder)).toEqual(["P1", "P2"]);
  });

  it("the log keeps a hash of a coder id that looks like an email address", async () => {
    await addCoders(["Dora@Uni.nl"]);
    await createSet("Dora@Uni.nl", ["unit-1"], "coder_set");
    await redeploy({}, [codersInvite()]);
    const [link] = (await links()).filter((l) => !l.retiredAt);
    expect((await send("dora", "/session", {}, { "x-link-secret": link!.secret })).status).toBe(200);
    await remove({ coders: ["Dora@Uni.nl"] });
    const [logged] = await query<{ coder: string }>(db, "SELECT coder FROM session_deletions");
    expect(logged!.coder).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
