import { describe, expect, it } from "vitest";
import type { CoderUnitResponse, DeploymentStatus } from "@annotinder/contracts";
import { splitDesignItems } from "@annotinder/contracts";
import { query } from "./testDb.js";
import { createApp } from "../app.js";
import { DbStore } from "../runtime/dbStore.js";
import type { Store } from "../runtime/store.js";

import {
  adminHeaders,
  db,
  server,
  storeCalls,
  restart,
  coder,
  sentiment,
  demo,
  dbAnnotations,
  sentimentQuestion,
  redeploy,
  deployDrafts,
  draftUnit,
  createSet,
  crowd,
  codersInvite,
  useServer,
  forgetStoreCalls,
} from "./coderHarness.js";

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
        loop: "loop_1",
        title: "main_loop",
        set: "all",
        queue: "shared",
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
      id: "loop_1",
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
      const unit = await c.next("loop_1");
      first.push(unit!.id);
      expect((await c.submit(unit!.id, { other: { done: true } }, "loop_1")).status).toBe(200);
    }
    expect(new Set(first).size).toBe(1);
    expect((await coder("c").next("loop_1"))!.id).not.toBe(first[0]);
    // Loop 2: two coders who disagree don't finish a unit
    const second: number[] = [];
    for (const [key, code] of [
      ["a", "positive"],
      ["b", "negative"],
    ]) {
      const c = coder(key);
      const unit = await c.next("loop_2");
      second.push(unit!.id);
      expect((await c.submit(unit!.id, sentiment(code), "loop_2")).status).toBe(200);
    }
    expect(new Set(second).size).toBe(1);
    expect((await coder("c").next("loop_2"))!.id).toBe(second[0]);
  });

  it("a loop can take the units each coder got in the previous loop, in that order", async () => {
    const first = {
      type: "unit_loop",
      id: "loop_1",
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
    for (let unit = await a.next("loop_1"); unit; unit = await a.next("loop_1")) {
      got.push(unit.id);
      expect((await a.submit(unit.id, { other: { done: true } }, "loop_1")).status).toBe(200);
    }
    expect(got).toHaveLength(2);
    const again: number[] = [];
    for (let unit = await a.next("loop_2"); unit; unit = await a.next("loop_2")) {
      again.push(unit.id);
      expect((await a.submit(unit.id, sentiment("neutral"), "loop_2")).status).toBe(200);
    }
    expect(again).toEqual(got);
    // Another coder got other units in loop 1, and gets those again
    const b = coder("b");
    const bFirst = await b.next("loop_1");
    expect(got).not.toContain(bFirst!.id);
    expect((await b.submit(bFirst!.id, { other: { done: true } }, "loop_1")).status).toBe(200);
    expect((await b.next("loop_2"))!.id).toBe(bFirst!.id);
    // The status: one row for the loop, whatever the number of coders
    const status = (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;
    expect(status.sources.filter((s) => s.title === "main_loop").map((s) => [s.set, s.coders])).toEqual([
      ["as loop_1", 2],
    ]);
  });

  it("a loop inserted before another leaves the coders, their units and their progress in their own loop", async () => {
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
    const a = coder("a");
    const held = await a.next("loop_1");

    // A new version with a new loop (a new id) before the one the coder is in
    const intro = {
      type: "unit_loop",
      id: "loop_2",
      label: "intro",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } }), intro]);

    // The unit a holds in the main loop is still theirs: another coder gets the next one
    expect((await coder("b").next("loop_1"))!.id).not.toBe(held!.id);
    expect((await a.next("loop_1"))!.id).toBe(held!.id);
    // And a is counted in the main loop, not in the new one
    const status = (await (
      await server.request("/api/study/1/deployment/status", { headers: adminHeaders })
    ).json()) as DeploymentStatus;
    expect(status.sources.filter((s) => s.title === "intro").map((s) => s.coders)).toEqual([]);
    expect(status.sources.filter((s) => s.title === "main_loop").map((s) => s.coders)).toEqual([2]);
    expect((await a.session()).progress.map((p) => p.loop)).toEqual(["loop_2", "loop_1"]);
  });

  it("a loop without an id is never given one: the draft saves with the issue, deploying is refused", async () => {
    const loop = { type: "unit_loop", children: [{ type: "layout", template: "" }, sentimentQuestion] };
    const res = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(splitDesignItems([loop])),
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { id: number; valid: boolean; items: object[] };
    expect(saved.valid).toBe(false);
    expect(saved.items).toEqual([loop]);
    const deploy = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: saved.id, units: true }),
    });
    expect(deploy.status).toBe(400);
  });

  it("deploying a design without a loop that coders worked in warns about it", async () => {
    const other = {
      type: "unit_loop",
      id: "loop_2",
      label: "second",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({}, [crowd(), other]);
    const a = coder("a");
    const unit = await a.next("loop_1");
    expect((await a.submit(unit!.id, sentiment("neutral"), "loop_1")).status).toBe(200);

    // The main loop (loop_1) replaced by a new loop, with a new id
    const deployed = await redeploy({ id: "loop_3", label: "new" }, [crowd(), other]);
    expect(deployed.warnings).toEqual([
      "Loop 'main_loop' (loop_1) is no longer in the design: 1 coder reached it (1 finished unit coding). " +
        "Their answers are kept, but coders no longer get this loop. To continue it, put the loop back with its id.",
    ]);
    // A loop nobody reached goes without a warning
    expect((await redeploy({ id: "loop_3", label: "new" }, [crowd()])).warnings ?? []).toEqual([]);
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
    useServer(createApp(db, { secret: "test-secret", wrapStore: racing, devMode: true }));
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
    const a = coder("a");
    const unitA = (await a.next())!;
    const { sessionId } = await a.session();
    between = async (store) =>
      store.putAnnotation({
        unitId: unitA.id,
        sessionId,
        variables: { sentiment: { done: true, skip: false, values: [{ value: "neutral" }] } },
        designVersionId: (await store.getDeployment()).design.id,
        codings: [{ loop: "loop_1", agreement: {} }],
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
    useServer(restart());
    expect((await status()).sources[0]).toEqual({ ...before, leasedUnits: 0 });

    // still open after the restart; agreeing with a completes it
    const c = coder("c");
    expect((await c.next())!.id).toBe(unit!.id);
    await c.submit(unit!.id, sentiment("positive"));
    expect((await status()).sources[0]).toMatchObject({ completeUnits: 1, codings: 3 });
    useServer(restart());
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

    useServer(restart());
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

    useServer(restart());
    expect((await coder("order", null).session()).progress[0].doneUnitIds).toEqual([first!.id, second!.id]);
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
    const back = async () =>
      ((await (await c.call(`/loop/loop_1/units/${unit.id}`)).json()) as CoderUnitResponse).data.text;
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
    useServer(other);
    const deployment = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
      designVersionId: number;
    };
    await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: deployment.designVersionId, active: false }),
    });
    useServer(first);
    expect((await c.call("/loop/loop_1/next")).status).toBe(409);
  });

  it("hands out a shared queue's units once, also when two processes are asked at the same time", async () => {
    await createSet("pair", ["unit-1", "unit-2"], "part_set");
    await redeploy({ units: { part: "pair" } }, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
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
    await createSet("queue", ["unit-1", "unit-2", "unit-3"], "part_set");
    await redeploy({ units: { part: "queue" } }, [crowd({ codersPerUnit: { min: 1, max: 1 } })]);
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

  it("hands an abandoned unit of a shared queue to another coder; old leases and those of ended sessions go", async () => {
    let now = Date.now();
    useServer(restart({ now: () => now }));
    await redeploy({}, [crowd({ codersPerUnit: { min: 1, max: 1 }, leaseSeconds: 60 })]);
    const leases = () =>
      query<{ sessionId: number; externalId: string }>(
        db,
        `SELECT l.session_id::int AS "sessionId", u.external_id AS "externalId"
         FROM unit_leases l JOIN units u ON u.id = l.unit_id ORDER BY 1, 2`,
      );
    const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => coder(`${name}-lease`));
    const abandoned = (await a.next())!;
    expect(abandoned.externalId).toBe("unit-1");
    expect((await b.next())!.externalId).toBe("unit-2");
    // While a's lease lasts the unit is theirs; once it expired it goes to the next coder
    now += 61_000;
    expect((await c.next())!.externalId).toBe("unit-1");
    expect(await leases()).toEqual([
      { sessionId: 1, externalId: "unit-1" },
      { sessionId: 2, externalId: "unit-2" },
      { sessionId: 3, externalId: "unit-1" },
    ]);
    // a comes back and can still submit it: a coding more than asked for, and their lease is done
    expect((await a.submit(abandoned.id, sentiment("positive"))).status).toBe(200);
    // b quits: their lease goes when leases are next written
    expect((await b.call("/quit", { method: "POST", body: JSON.stringify({ requestDeletion: false }) })).status).toBe(
      204,
    );
    expect((await d.next())!.externalId).toBe("unit-2");
    expect(await leases()).toEqual([
      { sessionId: 3, externalId: "unit-1" },
      { sessionId: 4, externalId: "unit-2" },
    ]);
    // More than a day after they expired, c's and d's are gone too
    now += 25 * 60 * 60_000;
    expect((await a.next())!.externalId).toBe("unit-2");
    expect(await leases()).toEqual([{ sessionId: 1, externalId: "unit-2" }]);
    expect((await c.submit(abandoned.id, sentiment("negative"))).status).toBe(409);
  });

  it("forgets idle deployments, and reads them again when used", async () => {
    let now = Date.now();
    useServer(restart({ now: () => now }));
    const c = coder("idle");
    await c.submit((await c.next())!.id, demo("neutral"));
    forgetStoreCalls();
    now += 7 * 60 * 60_000; // past deploymentIdleMs: loaded afresh
    await c.session();
    expect(storeCalls).toContain("getDeployment");
  });
});

describe("the status of a large study", () => {
  it("counts each share's units once, however many coders have it", async () => {
    await createSet("a", ["unit-1"], "coder_set");
    await createSet("b", ["unit-2"], "coder_set");
    await redeploy({}, [codersInvite()]);
    // 200 coders reached the loop, half with each of two shares of 150,000 units
    const UNITS = 150_000;
    const ids = (from: number) => Array.from({ length: UNITS }, (_, i) => from + i);
    const coders = Array.from({ length: 200 }, (_, i) => ({
      sessionId: i + 1,
      assignments: { loop_1: { at: 0 } },
      ended: null,
      deletionRequest: null,
      session: { coder: i % 2 ? "b" : "a" },
      linkId: null,
      email: null,
      knownUnits: null,
    }));
    const large = (store: Store): Store =>
      new Proxy(store, {
        get(target, prop, receiver) {
          if (prop === "listCoders") return async () => coders;
          if (prop === "getDeployment")
            return async () => ({
              ...(await target.getDeployment()),
              sets: [
                { name: "__all__", unitIds: ids(1).concat(ids(UNITS + 1)) },
                { name: "coder_set/a", unitIds: ids(1) },
                { name: "coder_set/b", unitIds: ids(UNITS + 1) },
              ],
            });
          const value = Reflect.get(target, prop, receiver) as unknown;
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
    const app = createApp(db, { secret: "test-secret", wrapStore: large, devMode: true });
    const status = () => app.request("/api/study/1/deployment/status", { headers: adminHeaders });
    const first = await status(); // loads the study
    expect(first.status, await first.clone().text()).toBe(200);
    const started = performance.now();
    const res = await status();
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    const share = { loop: "loop_1", queue: "own", totalUnits: UNITS, startedUnits: 0, codings: 0, coders: 100 };
    expect(((await res.json()) as DeploymentStatus).sources).toEqual([
      expect.objectContaining({ ...share, set: "coder_set=a" }),
      expect.objectContaining({ ...share, set: "coder_set=b" }),
    ]);
    // Seconds when units were added per coder (and an error above about 125,000 units)
    expect(elapsed).toBeLessThan(2000);
  });
});
