import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import {
  ALL_UNITS_UNITSET,
  BackendAnnotationSchema,
  BackendAnnotationBatchResultSchema,
  BackendCoderSchema,
  BackendFinishedSchema,
  BackendUnitSchema,
  ConformanceFixtureSchema,
  DeploymentSpecSchema,
  type BackendCoder,
  type ConformanceFixture,
  type DeploymentSpec,
} from "@annotinder/contracts";

// Conformance suite for the backend API: what a db server must do for the
// job server (contracts `backendEndpoints`, docs/architecture.md). A db
// server passes if it loaded `fixture.json` as one deployed job and every
// test here passes against it.
//
// Run it against a fresh load of the fixture: some tests use up invites
// (`maxUses`). Within a run, tests are independent of each other.

/** The fixture every db server loads before running the suite. */
export const fixture: ConformanceFixture = ConformanceFixtureSchema.parse(
  JSON.parse(readFileSync(new URL("../fixture.json", import.meta.url), "utf8")),
);

export interface ConformanceTarget {
  /** The db server's base URL; the suite calls `<baseUrl>/backend/job/<jobId>/...`. */
  baseUrl: string;
  /** The id the db server gave the fixture's job. */
  jobId: number;
  /** The shared secret the job server would use (`authorization: Bearer <secret>`). */
  secret: string;
  /** Defaults to the global `fetch`; tests can pass an in-process one. */
  fetch?: typeof fetch;
}

/**
 * Registers the suite with vitest. `target` is called lazily, so it can be
 * set up in the caller's own `beforeAll`.
 */
export function conformanceSuite(target: () => ConformanceTarget): void {
  // A unique prefix per run, so coder keys never collide with an earlier run.
  const run = Math.random().toString(36).slice(2, 8);
  const key = (name: string) => `conformance-${run}-${name}`;

  const call = async (path: string, init: { method?: string; body?: unknown; auth?: string | null } = {}) => {
    const t = target();
    const headers: Record<string, string> = { "content-type": "application/json" };
    const auth = init.auth === undefined ? `Bearer ${t.secret}` : init.auth;
    if (auth !== null) headers.authorization = auth;
    return (t.fetch ?? fetch)(`${t.baseUrl}/backend/job/${t.jobId}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  };
  const ok = async (res: Response) => {
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.status === 204 ? undefined : res.json();
  };
  const resolve = async (coderKey: string, extra: Record<string, unknown> = {}): Promise<BackendCoder> =>
    BackendCoderSchema.parse(await ok(await call("/coders/resolve", { method: "POST", body: { coderKey, ...extra } })));
  const newCoder = (name: string) => resolve(key(name), { inviteSecret: "conf-open" });
  const answer = (code: string) => ({ done: true, skip: false, codes: [{ code }] });
  const put = (unitId: number, coderId: number, variables: Record<string, unknown>) =>
    writeBatch([{ unitId, coderId, variables }]);
  /** The batch write endpoint, with its result validated. */
  const writeBatch = (annotations: unknown[]) => call("/annotations", { method: "POST", body: { annotations } });
  const batchResult = async (res: Promise<Response>) => BackendAnnotationBatchResultSchema.parse(await ok(await res));
  const finished = async (body: unknown) => BackendFinishedSchema.array().parse(await ok(await call("/finished", { method: "POST", body })));

  let spec: DeploymentSpec;
  /** externalId -> unit id, as assigned by the db server. */
  const ids = new Map<string, number>();

  beforeAll(async () => {
    spec = DeploymentSpecSchema.parse(await ok(await call("/deployment")));
    const all = spec.unitsets.find((u) => u.name === ALL_UNITS_UNITSET)?.unitIds ?? [];
    const units = BackendUnitSchema.array().parse(await ok(await call(`/units?ids=${all.join(",")}`)));
    for (const unit of units) ids.set(unit.externalId, unit.id);
  });
  const id = (externalId: string) => ids.get(externalId)!;

  describe("authentication", () => {
    it("refuses requests without the shared secret", async () => {
      expect((await call("/deployment", { auth: null })).status).toBe(401);
      expect((await call("/deployment", { auth: "Bearer wrong" })).status).toBe(401);
    });
  });

  describe("GET /deployment", () => {
    it("describes the deployed job", () => {
      expect(spec.jobId).toBe(target().jobId);
      expect(spec.version).toBeGreaterThan(0);
      expect(spec.active).toBe(true);
      expect(spec.annotationEpoch).toBeGreaterThanOrEqual(0);
      expect(spec.codebook.items.map((i) => i.name)).toEqual(fixture.codebook.items.map((i) => i.name));
    });

    it("lists every unitset in order, plus __all__ with every unit", () => {
      const byName = Object.fromEntries(spec.unitsets.map((u) => [u.name, u.unitIds]));
      expect(new Set(byName[ALL_UNITS_UNITSET])).toEqual(new Set(fixture.units.map((u) => id(u.externalId))));
      for (const unitset of fixture.unitsets) {
        expect(byName[unitset.name]).toEqual(unitset.externalIds.map(id));
      }
    });
  });

  describe("GET /units", () => {
    it("returns the requested units' content and leaves out unknown ids", async () => {
      const units = BackendUnitSchema.array().parse(await ok(await call(`/units?ids=${id("u2")},999999999`)));
      expect(units).toEqual([{ id: id("u2"), externalId: "u2", data: fixture.units[1].data, hash: expect.any(String) }]);
    });

    it("gives each unit a content hash that is stable, and differs between different content", async () => {
      const all = [...ids.values()].join(",");
      const first = BackendUnitSchema.array().parse(await ok(await call(`/units?ids=${all}`)));
      const again = BackendUnitSchema.array().parse(await ok(await call(`/units?ids=${all}`)));
      const hashes = (units: typeof first) => new Map(units.map((u) => [u.id, u.hash]));
      expect(hashes(again)).toEqual(hashes(first));
      expect(new Set(first.map((u) => u.hash)).size).toBe(first.length); // fixture units all differ
    });
  });

  describe("coders", () => {
    it("creates a coder from an invite, and finds it again by key", async () => {
      const created = await resolve(key("a"), { inviteSecret: "conf-open" });
      expect(created.assignments).toEqual({});
      expect((await resolve(key("a"))).coderId).toBe(created.coderId);
      const listed = BackendCoderSchema.array().parse(await ok(await call("/coders")));
      expect(listed.map((c) => c.coderId)).toContain(created.coderId);
    });

    it("refuses unknown keys without a valid invite", async () => {
      expect((await call("/coders/resolve", { method: "POST", body: { coderKey: key("x") } })).status).toBe(401);
      const wrong = await call("/coders/resolve", { method: "POST", body: { coderKey: key("x"), inviteSecret: "nope" } });
      expect(wrong.status).toBe(401);
    });

    it("copies an invite's preset variables to the new coder", async () => {
      const coder = await resolve(key("preset"), { inviteSecret: "conf-preset" });
      expect(coder.variables.group?.codes).toEqual([{ code: "b" }]);
    });

    it("enforces maxUses", async () => {
      await resolve(key("single-1"), { inviteSecret: "conf-single" });
      const second = await call("/coders/resolve", {
        method: "POST",
        body: { coderKey: key("single-2"), inviteSecret: "conf-single" },
      });
      expect(second.status).toBe(401);
    });

    it("refuses invites that require login", async () => {
      const res = await call("/coders/resolve", { method: "POST", body: { coderKey: key("login"), inviteSecret: "conf-login" } });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "auth_required" });
    });

    it("never gives a participant's session to a new key, but allows a new session", async () => {
      const first = await resolve(key("p1"), { inviteSecret: "conf-url", participantId: "P-url" });
      const again = await call("/coders/resolve", {
        method: "POST",
        body: { coderKey: key("p2"), inviteSecret: "conf-url", participantId: "P-url" },
      });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ code: "participant_has_session" });

      // a new session of the same participant: a new coder, not counted against maxUses (1)
      const second = await resolve(key("p2"), { inviteSecret: "conf-url", participantId: "P-url", newSession: true });
      expect(second.coderId).not.toBe(first.coderId);
    });

    it("uses an invite's fixed participant id", async () => {
      await resolve(key("f1"), { inviteSecret: "conf-fixed" });
      const again = await call("/coders/resolve", { method: "POST", body: { coderKey: key("f2"), inviteSecret: "conf-fixed" } });
      expect(again.status).toBe(409);
    });

    it("replaces a coder's variables and assignments", async () => {
      const coder = await newCoder("put");
      const body = { variables: { group: answer("a") }, assignments: { main: ["first_half", "second_half"] } };
      await ok(await call(`/coders/${coder.coderId}`, { method: "PUT", body }));
      expect(await resolve(key("put"))).toMatchObject({ coderId: coder.coderId, ...body });
      expect((await call("/coders/999999999", { method: "PUT", body })).status).toBe(404);
    });
  });

  describe("annotations", () => {
    it("accepts the hash of the content shown, also when it is not the current one", async () => {
      const coder = await newCoder("hash");
      const [unit] = BackendUnitSchema.array().parse(await ok(await call(`/units?ids=${id("u1")}`)));
      const write = (unitHash: string) =>
        batchResult(writeBatch([{ unitId: unit.id, coderId: coder.coderId, variables: { q1: answer("yes") }, unitHash }]));
      expect(await write(unit.hash)).toEqual({ rejected: [] });
      expect(await write("not-the-current-hash")).toEqual({ rejected: [] }); // recorded, never refused
    });

    it("upserts values per variable and leaves other variables alone", async () => {
      const coder = await newCoder("ann");
      await ok(await put(id("u1"), coder.coderId, { q1: answer("yes"), old: answer("kept") }));
      await ok(await put(id("u1"), coder.coderId, { q1: answer("no") }));

      const annotations = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${coder.coderId}`)));
      expect(annotations).toHaveLength(1);
      expect(annotations[0].unitId).toBe(id("u1"));
      expect(annotations[0].variables.q1.codes).toEqual([{ code: "no" }]);
      expect(annotations[0].variables.old.codes).toEqual([{ code: "kept" }]);
    });

    it("orders a coder's units by first write, also after edits", async () => {
      const coder = await newCoder("order");
      await ok(await put(id("u3"), coder.coderId, { q1: answer("yes") }));
      await new Promise((r) => setTimeout(r, 5));
      await ok(await put(id("u1"), coder.coderId, { q1: answer("yes") }));
      await new Promise((r) => setTimeout(r, 5));
      await ok(await put(id("u3"), coder.coderId, { q1: answer("no") }));

      const annotations = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${coder.coderId}`)));
      expect(annotations.map((a) => a.unitId)).toEqual([id("u3"), id("u1")]);
    });

    it("only returns the requested coder's annotations, and requires coderId", async () => {
      const a = await newCoder("own-a");
      const b = await newCoder("own-b");
      await ok(await put(id("u2"), a.coderId, { q1: answer("yes") }));
      const ofB = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${b.coderId}`)));
      expect(ofB).toEqual([]);
      expect((await call("/annotations")).status).toBe(400);
    });

    it("applies a batch in order: a later write for the same unit wins", async () => {
      const coder = await newCoder("batch");
      const write = (unitId: number, code: string) => ({ unitId, coderId: coder.coderId, variables: { q1: answer(code) } });
      expect(await batchResult(writeBatch([write(id("u1"), "yes"), write(id("u2"), "yes"), write(id("u1"), "no")]))).toEqual({
        rejected: [],
      });
      const annotations = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${coder.coderId}`)));
      expect(annotations.map((a) => [a.unitId, a.variables.q1.codes])).toEqual([
        [id("u1"), [{ code: "no" }]],
        [id("u2"), [{ code: "yes" }]],
      ]);
    });

    it("skips and reports writes for unknown units or coders, and stores the rest", async () => {
      const coder = await newCoder("bad");
      const result = await batchResult(
        writeBatch([
          { unitId: 999999999, coderId: coder.coderId, variables: { q1: answer("yes") } },
          { unitId: id("u1"), coderId: coder.coderId, variables: { q1: answer("yes") } },
          { unitId: id("u1"), coderId: 999999999, variables: { q1: answer("yes") } },
        ]),
      );
      expect(result.rejected.map((r) => r.index)).toEqual([0, 2]);
      const stored = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${coder.coderId}`)));
      expect(stored.map((a) => a.unitId)).toEqual([id("u1")]);
    });

    it("refuses malformed batches", async () => {
      expect((await call("/annotations", { method: "POST", body: { nope: 1 } })).status).toBe(400);
      expect((await writeBatch([])).status).toBe(400);
    });
  });

  describe("POST /finished", () => {
    it("lists (unit, coder) pairs where every variable of a group is live", async () => {
      const coder = await newCoder("fin");
      await ok(await put(id("u1"), coder.coderId, { q1: answer("yes"), q2: answer("x") }));
      await new Promise((r) => setTimeout(r, 5));
      await ok(await put(id("u2"), coder.coderId, { q1: answer("no") }));

      const both = await finished({ loops: [{ loop: "main", variables: ["q1", "q2"] }], coderId: coder.coderId });
      expect(both.map((f) => [f.loop, f.unitId, f.coderId])).toEqual([["main", id("u1"), coder.coderId]]);

      // per group, ordered by first write
      const groups = await finished({
        loops: [
          { loop: "only_q1", variables: ["q1"] },
          { loop: "with_q3", variables: ["q1", "q2", "q3"] },
        ],
        coderId: coder.coderId,
      });
      expect(groups.map((f) => [f.loop, f.unitId])).toEqual([
        ["only_q1", id("u1")],
        ["only_q1", id("u2")],
      ]);
    });

    it("returns the values of requested variables, and nothing else", async () => {
      const coder = await newCoder("values");
      await ok(await put(id("u4"), coder.coderId, { q1: answer("yes"), q2: answer("y") }));
      const [row] = await finished({ loops: [{ loop: "main", variables: ["q1", "q2"], values: ["q2"] }], coderId: coder.coderId });
      expect(Object.keys(row.values ?? {})).toEqual(["q2"]);
      expect(row.values?.q2.codes).toEqual([{ code: "y" }]);
    });

    it("covers all coders without coderId", async () => {
      const a = await newCoder("all-a");
      const b = await newCoder("all-b");
      await ok(await put(id("u3"), a.coderId, { q1: answer("yes") }));
      await ok(await put(id("u3"), b.coderId, { q1: answer("no") }));
      const rows = await finished({ loops: [{ loop: "l", variables: ["q1"] }] });
      const coders = rows.filter((r) => r.unitId === id("u3")).map((r) => r.coderId);
      expect(coders).toEqual(expect.arrayContaining([a.coderId, b.coderId]));
    });

    it("lists coders with coder-level values for coder-level groups", async () => {
      const preset = await resolve(key("lvl-preset"), { inviteSecret: "conf-preset" });
      const set = await newCoder("lvl-set");
      const none = await newCoder("lvl-none");
      await ok(await call(`/coders/${set.coderId}`, { method: "PUT", body: { variables: { group: answer("a") }, assignments: {} } }));

      const rows = await finished({ loops: [{ loop: "group", level: "coder", variables: ["group"], values: ["group"] }] });
      const byCoder = new Map(rows.map((r) => [r.coderId, r]));
      expect(byCoder.get(preset.coderId)).toMatchObject({ loop: "group", unitId: null });
      expect(byCoder.get(preset.coderId)?.values?.group.codes).toEqual([{ code: "b" }]);
      expect(byCoder.get(set.coderId)?.values?.group.codes).toEqual([{ code: "a" }]);
      expect(byCoder.has(none.coderId)).toBe(false);

      // only one coder
      const one = await finished({ loops: [{ loop: "g", level: "coder", variables: ["group"] }], coderId: set.coderId });
      expect(one.map((r) => [r.coderId, r.unitId])).toEqual([[set.coderId, null]]);
    });

    it("keeps coder-level and unit-level values apart", async () => {
      const coder = await resolve(key("lvl-apart"), { inviteSecret: "conf-preset" });
      await ok(await put(id("u1"), coder.coderId, { q1: answer("yes") }));
      const unitLevel = await finished({ loops: [{ loop: "g", variables: ["group"] }], coderId: coder.coderId });
      const coderLevel = await finished({ loops: [{ loop: "q", level: "coder", variables: ["q1"] }], coderId: coder.coderId });
      expect(unitLevel).toEqual([]);
      expect(coderLevel).toEqual([]);
      // and coder-level values are not part of the coder's unit annotations
      const annotations = BackendAnnotationSchema.array().parse(await ok(await call(`/annotations?coderId=${coder.coderId}`)));
      expect(annotations.map((a) => a.unitId)).toEqual([id("u1")]);
    });

    it("drops coder-level values a full replace leaves out", async () => {
      const coder = await newCoder("lvl-replace");
      const put = (variables: Record<string, unknown>) =>
        call(`/coders/${coder.coderId}`, { method: "PUT", body: { variables, assignments: {} } });
      await ok(await put({ group: answer("a") }));
      await ok(await put({}));
      expect((await resolve(key("lvl-replace"))).variables).toEqual({});
      expect(await finished({ loops: [{ loop: "g", level: "coder", variables: ["group"] }], coderId: coder.coderId })).toEqual([]);
    });
  });
}
