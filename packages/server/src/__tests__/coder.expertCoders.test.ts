import { describe, expect, it } from "vitest";
import type { DeploymentStatus, SessionResponse, PickNamesResponse } from "@annotinder/contracts";
import { RELEASE, splitDesignItems } from "@annotinder/contracts";
import { eq } from "drizzle-orm";
import { links as linksTable } from "../db/schema/index.js";
import { query } from "./testDb.js";
import { createApp } from "../app.js";
import type { Store } from "../runtime/store.js";
import { ensureUser } from "../shared/accounts.js";
import { createSession } from "../shared/sessions.js";

import {
  chosen,
  adminHeaders,
  db,
  server,
  restart,
  devices,
  send,
  coder,
  sentiment,
  unitByExternalId,
  sentimentQuestion,
  redeploy,
  deployDrafts,
  draftUnit,
  createSet,
  listOf,
  links,
  reach,
  sessionItem,
  crowd,
  codersInvite,
  useServer,
  CODER_LOGIN,
} from "./coderHarness.js";

describe("coders", () => {
  const coders = codersInvite();
  /** The units a coder gets, finishing each. */
  const order = async (c: ReturnType<typeof coder>, loop = "loop_1") => {
    const seen: string[] = [];
    for (let u = await c.next(loop); u; u = await c.next(loop)) {
      seen.push(u.externalId);
      await c.submit(u.id, sentiment("positive"));
    }
    return seen;
  };

  it("by link: a link per coder, who gets the units whose coder_set holds them, and the overlap units", async () => {
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("bob", ["unit-2", "unit-1"], "coder_set"); // unit-1: anna;bob
    await createSet("overlap", ["unit-3"], "test_set");
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
    await createSet("carol", ["unit-3"], "coder_set");
    expect((await deployDrafts()).links).toBe(3);
    const ids = async (names: string[]) => Promise.all(names.map(async (n) => (await unitByExternalId(n)).id));
    await server.request("/api/study/1/sets/coder_set", {
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
    // A column the design uses can't be deleted
    expect(
      (await server.request("/api/study/1/sets/coder_set", { method: "DELETE", headers: adminHeaders })).status,
    ).toBe(409);
  });

  it("by email address: one link, coders sign in, only those addresses", async () => {
    await createSet("a@example.org", ["unit-1"], "coder_set");
    await createSet("b@example.org", ["unit-2"], "coder_set");
    expect((await redeploy({}, [codersInvite("login")])).links).toBe(1);
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
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("bob", ["unit-2"], "coder_set");
    await redeploy({}, [sessionItem({ invite: { mode: "coders", link: "pick_name" } })]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const names = async () =>
      (await (
        await server.request("/api/d/demostudy001/names", { headers: { "x-annotinder": "1", "x-link-secret": secret } })
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
    await redeploy({}, [sessionItem({ invite: { mode: "coders", link: "pick_name", nameDevices: "any" } })]);
    const shared = (await (await start("p3", "anna")).json()) as SessionResponse;
    expect(shared.sessionId).toBe(anna.sessionId);
    expect((await names()).names.every((n) => !n.taken)).toBe(true);

    // A trusted team's feature: email addresses can be names too
    await createSet("c@example.org", ["unit-3"], "coder_set");
    await deployDrafts();
    expect((await names()).names.map((n) => n.name)).toContain("c@example.org");

    // A revoked link lists no names
    await db.update(linksTable).set({ revokedAt: new Date() }).where(eq(linksTable.secret, secret));
    const revoked = await server.request("/api/d/demostudy001/names", {
      headers: { "x-annotinder": "1", "x-link-secret": secret },
    });
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ code: "link_revoked" });
  });

  it("signing in needs email addresses; expert coders need coder_set", async () => {
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("b@example.org", ["unit-2"], "coder_set");
    const design = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(
        chosen(
          splitDesignItems([
            codersInvite("login"),
            {
              type: "unit_loop",
              id: "loop_1",
              units: {},
              children: [{ type: "layout", template: "" }, sentimentQuestion],
            },
          ]),
        ),
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
    // A text field isn't a column with a role
    expect(
      (
        await server.request("/api/study/1/sets/text", {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify({ sets: [] }),
        })
      ).status,
    ).toBe(400);
  });

  it("without coder_set there are no coders: the draft saves, deploying is refused", async () => {
    const design = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(
        chosen(
          splitDesignItems([
            codersInvite(),
            {
              type: "unit_loop",
              id: "loop_1",
              units: {},
              children: [{ type: "layout", template: "" }, sentimentQuestion],
            },
          ]),
        ),
      ),
    });
    expect(design.status).toBe(201);
    const { id } = (await design.json()) as { id: number };
    const deploy = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: id, units: true }),
    });
    expect(await deploy.json()).toMatchObject({
      code: "assignment_invalid",
      error: expect.stringContaining("the units have no coder_set column yet"),
    });
  });

  it("no units yet: none, until the next deploy brings them, as it brings new units", async () => {
    await createSet("anna", [], "coder_set");
    await redeploy({}, [coders]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const anna = coder("anna", secret);
    expect(await anna.next()).toBeNull();
    const set = await createSet("anna", ["unit-2"], "coder_set");
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

  it("coders who got new units are told once, and a finished session opens again for them", async () => {
    await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Demo", reopenMinutes: null }),
    });
    await createSet("anna", ["unit-1"], "coder_set");
    await redeploy({}, [coders]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const anna = coder("anna", secret);
    const first = await anna.next();
    await anna.submit(first!.id, sentiment("neutral"));
    expect(await anna.next()).toBeNull();
    await anna.call("/end", { method: "POST", body: "{}" });
    expect((await anna.session()).newUnits).toBeNull();

    await createSet("anna", ["unit-1", "unit-2"], "coder_set");
    await deployDrafts();
    const back = await anna.session();
    expect(back.newUnits).toEqual({ count: 1, message: "1 new units were added for you." });
    expect(back.ended).toBeNull();
    expect((await anna.next())!.externalId).toBe("unit-2");
    expect((await anna.session()).newUnits).toBeNull();

    // The message is the deployment's: changed or turned off on deploy
    const current = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
      designVersionId: number;
      newUnitsMessage: string | null;
    };
    expect(current.newUnitsMessage).toBe("{n} new units were added for you.");
    await createSet("anna", ["unit-1", "unit-2", "unit-3"], "coder_set");
    const res = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: current.designVersionId, units: true, newUnitsMessage: "More: {n}" }),
    });
    expect(res.status).toBe(200);
    expect((await anna.session()).newUnits).toEqual({ count: 1, message: "More: 1" });
  });

  it("a session that can't be reopened any more isn't told of new units", async () => {
    let now = Date.now();
    useServer(restart({ now: () => now }));
    await createSet("anna", ["unit-1"], "coder_set");
    await redeploy({}, [coders]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const anna = coder("anna", secret);
    await anna.submit((await anna.next())!.id, sentiment("neutral"));
    await anna.call("/end", { method: "POST", body: "{}" });
    await anna.session();
    now += 25 * 60 * 60 * 1000;
    await createSet("anna", ["unit-1", "unit-2"], "coder_set");
    await deployDrafts();
    const late = await anna.session();
    expect(late.newUnits).toBeNull();
    expect(late.ended).toMatchObject({ outcome: "complete" });
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
    await createSet("a", ["unit-1", "unit-2"], "condition_set");
    await createSet("b", ["unit-1", "unit-3"], "condition_set");
    const framing = {
      type: "experiment",
      name: "framing",
      variable: { type: "experiment", draw: "balanced", selectsUnits: true },
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

  it("loops with the same columns and part but another overlap count each get their own", async () => {
    await createSet("overlap", ["unit-1", "unit-2", "unit-3"], "test_set");
    const first = {
      type: "unit_loop",
      id: "loop_1",
      label: "first",
      units: { overlap: "ignore" },
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({ units: { overlap: "before" } }, [crowd(), first]);
    const c = coder("c");
    // Loop 2 first: the order in which a server computes them doesn't matter
    const second = (await c.batch(20, "loop_2")).length;
    const one = (await c.batch(20, "loop_1")).length;
    expect(second - one).toBe(3);
  });

  it("hands out the same unfinished unit again, and marks each loop the coder reached", async () => {
    const before = {
      type: "unit_loop",
      id: "loop_1",
      label: "before",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({ units: { overlap: "ignore" } }, [before]);
    const c = coder("c");
    const first = await c.next("loop_2");
    expect((await c.next("loop_2"))!.id).toBe(first!.id);
    expect(await c.next("loop_1")).not.toBeNull();
    const { sessionId } = await c.session();
    const [stored] = await query<{ assignments: Record<string, unknown> }>(
      db,
      "SELECT assignments FROM coder_sessions WHERE id = $1",
      [sessionId],
    );
    expect(stored.assignments).toEqual({ loop_1: { at: expect.any(Number) }, loop_2: { at: expect.any(Number) } });
    // The units follow from the session: no branch to choose (an old client's `branch` is ignored)
    expect((await c.call("/loop/loop_2/next?branch=3")).status).toBe(200);
  });

  it("a condition drawn twice at once has one value, in the answers and the session", async () => {
    await createSet("p1", ["unit-1"], "condition_set");
    await createSet("p2", ["unit-2"], "condition_set");
    const part = {
      type: "experiment",
      name: "part",
      variable: { type: "experiment", draw: "random", selectsUnits: true },
    };
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
    useServer(createApp(db, { secret: "test-secret", runtime: { random: () => 0 }, wrapStore: racing, devMode: true }));
    const c = coder("c");
    const { sessionId } = await c.session();
    between = async (store) => {
      await store.putCoderValues({
        sessionId,
        values: { part: { done: true, skip: false, values: [{ value: "p2" }] } },
        assigned: true,
        designVersionId: (await store.getDeployment()).design.id,
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
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("bob", ["unit-2"], "coder_set");
    await redeploy({}, [codersInvite()]);
    const byCoder = Object.fromEntries(
      (await links()).filter((l) => !l.retiredAt).map((l) => [l.params.coder, l.secret]),
    );
    const anna = coder("anna", byCoder.anna);
    const unit1 = await anna.next();
    expect((await anna.submit(unit1!.id, sentiment("positive"))).status).toBe(200);
    // unit-1 moves from anna to bob
    await createSet("anna", ["unit-3"], "coder_set");
    await createSet("bob", ["unit-2", "unit-1"], "coder_set");
    await deployDrafts();
    expect((await anna.call(`/loop/loop_1/units/${unit1!.id}`)).status).toBe(200);
    expect((await anna.submit(unit1!.id, sentiment("negative"))).status).toBe(200);
    // It stays in anna's progress, next to her new unit
    expect((await anna.session()).progress[0]).toMatchObject({ doneUnitIds: [unit1!.id], totalUnits: 2 });
    const bob = coder("bob", byCoder.bob);
    const bobs = (await bob.batch(10)).map((u) => u.externalId);
    expect(bobs).toContain("unit-1");
  });

  it("an email coder asking for a new session continues their own", async () => {
    await createSet("a@example.org", ["unit-1"], "coder_set");
    await redeploy({}, [codersInvite("login")]);
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
    await createSet("anna", ["unit-1"], "coder_set");
    await redeploy({}, [codersInvite()]);
    const res = await early.call("/loop/loop_1/next");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "not_assigned" });
  });
});

describe("loop parts and the overlap", () => {
  const coders = codersInvite();
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
    await createSet("s1", ["unit-1", "unit-2"], "coder_set");
    await createSet("overlap", ["unit-2", "unit-3"], "test_set");
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
    // Without the coder's own units: only the test units
    await redeploy({ units: { coding: false, overlap: "before" } }, [coders]);
    expect(await order("special")).toEqual(["unit-2", "unit-3"]);
  });

  it("a crowd's overlap units: the queue divides the rest, every coder gets the overlap", async () => {
    await createSet("overlap", ["unit-3"], "test_set");
    await redeploy({ units: { overlap: "after" } }, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
    expect(await order("first-coder")).toEqual(["unit-1", "unit-2", "unit-3"]);
    // The queue is done; the overlap is everyone's
    expect(await order("second-coder")).toEqual(["unit-3"]);
  });

  it("show one part of the study: the units with it in part_set; test units without a part in every part", async () => {
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const more = ["unit-4", "unit-5", "unit-6"].map((externalId) => ({ externalId, data }));
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: more }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    await createSet("pre", ["unit-1", "unit-4"], "part_set");
    await createSet("post", ["unit-2", "unit-3", "unit-5"], "part_set");
    // unit-4 is a pre overlap unit; unit-5 a post one, unit-6 an overlap unit of every part
    await createSet("overlap", ["unit-4", "unit-5", "unit-6"], "test_set");
    await redeploy({ units: { part: "post", overlap: "after" } });
    expect(await order("post")).toEqual(["unit-2", "unit-3", "unit-5", "unit-6"]);
    await redeploy({ units: { part: "pre", overlap: "after" } });
    expect(await order("pre")).toEqual(["unit-1", "unit-4", "unit-6"]);
    // Without a part: every coding unit
    await redeploy({ units: { overlap: "ignore" } });
    expect((await order("all")).sort()).toEqual(["unit-1", "unit-2", "unit-3"]);
  });
});

describe("routing by session values", () => {
  const condition = {
    type: "experiment",
    name: "condition",
    variable: { type: "experiment", draw: "balanced", options: [{ value: "s1" }, { value: "s2" }], selectsUnits: true },
  };

  it("an experiment that selects units: it can't be overwritten, and stays across restarts", async () => {
    await createSet("s1", ["unit-1"], "condition_set");
    await createSet("s2", ["unit-2"], "condition_set");
    await redeploy({}, [condition]);
    const carol = coder("carol");
    expect(await reach(carol, "condition")).toEqual([{ value: "s1" }]);
    const first = await carol.next();
    expect(first!.externalId).toBe("unit-1");
    // the client can't overwrite drawn conditions
    const tamper = await carol.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({ variables: { condition: { done: true, values: [{ value: "s2" }] } } }),
    });
    expect(tamper.status).toBe(204);
    expect((await carol.session()).variables.condition.values).toEqual([{ value: "s1" }]);

    // even after a restart, carol has the same units
    useServer(restart());
    const again = coder("carol", null);
    expect((await again.next())!.id).toBe(first!.id);

    // balanced across a restart: the counts are in the database
    const dave = coder("dave");
    expect(await reach(dave, "condition")).toEqual([{ value: "s2" }]);
    expect((await dave.next())!.externalId).toBe("unit-2");
  });

  it("a coder's units follow the session when the loop moves or its settings change; what they coded stays theirs", async () => {
    await createSet("s1", ["unit-1", "unit-3"], "condition_set");
    await createSet("s2", ["unit-2"], "condition_set");
    await redeploy({}, [condition]);
    const b = coder("b");
    expect(await reach(b, "condition")).toEqual([{ value: "s1" }]);
    const coded = (await b.next())!;
    expect(coded.externalId).toBe("unit-1");
    expect((await b.submit(coded.id, sentiment("positive"))).status).toBe(200);
    // Another loop in front: this one is loop 2 now, and has another label
    const warmUp = { type: "question", name: "warm_up", variable: { type: "confirm", question: "?" } };
    const before = {
      type: "unit_loop",
      id: "loop_1",
      label: "warm-up",
      children: [{ type: "layout", template: "" }, warmUp],
    };
    await redeploy({ label: "renamed" }, [condition, before]);
    expect((await b.next("loop_2"))!.externalId).toBe("unit-3");
    // A part that leaves out what b coded: b can still go back to it and change the answer
    await createSet("late", ["unit-3"], "part_set");
    await redeploy({ units: { part: "late" } }, [condition]);
    expect((await b.call(`/loop/loop_1/units/${coded.id}`)).status).toBe(200);
    expect((await b.submit(coded.id, sentiment("negative"))).status).toBe(200);
    expect((await b.next())!.externalId).toBe("unit-3");
  });
});

describe("columns with a role", () => {
  const draftFields = async () => {
    const [{ units }] = await query<{ units: { fields: { name: string; type: string }[] } }>(
      db,
      "SELECT units FROM design_versions WHERE study_id = 1 ORDER BY id DESC LIMIT 1",
    );
    return units.fields;
  };

  it("are unit fields of their type in the draft design: made with their sets, gone with them; never in uploads", async () => {
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("gold", ["unit-2"], "test_set");
    expect(await draftFields()).toContainEqual({ name: "coder_set", type: "set" });
    expect(await draftFields()).toContainEqual({ name: "test_set", type: "test_set" });
    // An upload doesn't give set columns as data
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "unit-x", data: { ...data, coder_set: "bob" } }] }),
    });
    expect(upload.status).toBe(400);
    expect(await upload.json()).toMatchObject({ error: expect.stringContaining("is a column with a role") });
    expect(
      (await server.request("/api/study/1/sets/coder_set", { method: "DELETE", headers: adminHeaders })).status,
    ).toBe(204);
    expect((await draftFields()).map((f) => f.name)).not.toContain("coder_set");
  });
});

describe("a crowd", () => {
  it("has one link, which takes at most the most coders", async () => {
    await redeploy({}, [crowd(undefined, { maxCoders: 1 })]);
    const active = (await links()).filter((l) => !l.retiredAt);
    expect(active.map((l) => l.params)).toEqual([{}]);
    const listed = (await listOf("links")) as {
      maxUses?: number;
    }[];
    expect(listed.map((l) => l.maxUses)).toContain(1);
    expect((await send("ann", "/session", {}, { "x-link-secret": active[0].secret })).status).toBe(200);
    expect((await send("bo", "/session", {}, { "x-link-secret": active[0].secret })).status).toBe(403);
  });
});
