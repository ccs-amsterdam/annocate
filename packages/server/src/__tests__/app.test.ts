import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/index.js";
import { emptyDb, query } from "./testDb.js";
import { createApp } from "../app.js";
import { DbStore } from "../runtime/dbStore.js";
import { HttpError } from "../shared/http.js";
import {
  DESIGN_FORMAT_VERSION,
  ServerInfoSchema,
  splitDesignItems,
  type DesignItem,
  type VariableValue,
} from "@annotinder/contracts";
import { CLIENT_VERSION } from "../version.js";

let db: Db;
let app: ReturnType<typeof createApp>;

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are inspected loosely
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devMode: true });
});

async function createStudy(name = "Test study") {
  const res = await app.request("/api/study", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: number; name: string; coderKind: string | null }>;
}

describe("responses", () => {
  it("are gzipped for clients that accept it", async () => {
    for (let i = 0; i < 20; i++) await createStudy(`Study number ${i}`);
    const zipped = await app.request("/api/study", { headers: { ...adminHeaders, "accept-encoding": "gzip" } });
    expect(zipped.headers.get("content-encoding")).toBe("gzip");
    const plain = await app.request("/api/study", { headers: adminHeaders });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect((await json(plain)).studies.length).toBe(20);
  });
});

describe("study routes", () => {
  it("creates and fetches a study", async () => {
    const study = await createStudy("My study");
    const res = await app.request(`/api/study/${study.id}`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe("My study");
  });

  it("allows creating multiple studies and lists them", async () => {
    const study1 = await createStudy("First");
    const study2 = await createStudy("Second");
    const res = await app.request("/api/study", { headers: adminHeaders });
    expect(res.status).toBe(200);
    const { studies } = (await json(res)) as { studies: { id: number; name: string }[] };
    expect(studies.map((j) => j.id).sort()).toEqual([study1.id, study2.id].sort());
  });

  it("lists are objects that can be read in pages: limit, and after with the next of the page before", async () => {
    const ids: number[] = [];
    for (const name of ["a", "b", "c", "d", "e"]) ids.push((await createStudy(name)).id);
    const list = async (query = "") => {
      const res = await app.request(`/api/study${query}`, { headers: adminHeaders });
      return { status: res.status, body: (await json(res)) as { studies: { id: number }[]; next?: number } };
    };
    // Whole, without next
    const whole = (await list()).body;
    expect(whole.studies.map((s) => s.id)).toEqual(ids);
    expect(whole).not.toHaveProperty("next");
    // In pages of two
    const first = (await list("?limit=2")).body;
    expect(first).toMatchObject({ studies: [{ id: ids[0] }, { id: ids[1] }], next: ids[1] });
    const second = (await list(`?limit=2&after=${first.next}`)).body;
    expect(second).toMatchObject({ studies: [{ id: ids[2] }, { id: ids[3] }], next: ids[3] });
    const last = (await list(`?limit=2&after=${second.next}`)).body;
    expect(last.studies.map((s) => s.id)).toEqual([ids[4]]);
    expect(last).not.toHaveProperty("next");
    // A page that ends the list exactly has no next
    expect((await list(`?limit=1&after=${ids[3]}`)).body).not.toHaveProperty("next");
    // What the request can't ask
    expect((await list("?limit=0")).status).toBe(400);
    expect((await list("?limit=10001")).status).toBe(400);
    expect((await list("?after=x")).status).toBe(400);
    const gone = await list("?after=99999");
    expect(gone.status).toBe(400);
    expect((gone.body as unknown as { error: string }).error).toContain("start again without after");
  });

  it("every list that grows with a study is such an object", async () => {
    const study = await createStudy("Lists");
    for (const [path, key] of [
      ["/design", "versions"],
      ["/units", "units"],
      ["/links", "links"],
      ["/sessions", "sessions"],
      ["/devices", "devices"],
    ]) {
      const res = await app.request(`/api/study/${study.id}${path}?limit=5`, { headers: adminHeaders });
      expect(res.status, path).toBe(200);
      expect(await json(res), path).toEqual({ [key]: [] });
    }
    // The coders come with the units no expert coder has
    const coders = await app.request(`/api/study/${study.id}/coders?limit=5`, { headers: adminHeaders });
    expect(await json(coders)).toEqual({ coders: [], unassigned: { live: null, draft: 0 } });
    const users = await app.request("/api/admin/users?limit=1", { headers: adminHeaders });
    expect(Object.keys(await json(users))).toContain("users");
  });

  it("PUT keeps what is left out: an archived study stays archived when it is renamed", async () => {
    const study = await createStudy();
    const put = async (body: object) =>
      json(
        await app.request(`/api/study/${study.id}`, {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify(body),
        }),
      );
    expect((await put({ name: "Old", archived: true })).archived).toBe(true);
    expect(await put({ name: "Renamed" })).toMatchObject({ name: "Renamed", archived: true });
    expect((await put({ name: "Renamed", archived: false })).archived).toBe(false);
  });

  describe("who codes: expert coders or a crowd", () => {
    const loop = {
      type: "unit_loop",
      id: "loop_1",
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "q1", variable: { type: "confirm", question: "?" } },
      ],
    };
    const EXPERTS = { invite: { mode: "coders", link: "per_coder" } };
    const CROWD = { invite: { mode: "crowd" } };
    const call = (method: string, path: string, body?: object) =>
      app.request(`/api/study/${path}`, { method, headers: adminHeaders, body: body && JSON.stringify(body) });
    const read = async (path: string) => json(await call("GET", path));
    const postDesign = async (studyId: number, session?: object) =>
      json(await call("POST", `${studyId}/design`, { items: [loop], session }));
    const deploy = (studyId: number, designVersionId: number) =>
      call("PUT", `${studyId}/deployment`, { designVersionId, units: true });
    const coderKind = async (studyId: number) => (await read(`${studyId}`)).coderKind;
    /** A study with two units, each an expert coder's (anna has an email address). */
    const studyWithExperts = async (name: string) => {
      const study = await createStudy(name);
      const units = ["u1", "u2"].map((externalId) => ({ externalId, data: { text: "A text" } }));
      expect((await call("POST", `${study.id}/units`, { units })).status).toBe(201);
      const coders = [{ coder: "anna", email: "anna@example.org" }, { coder: "bob" }];
      expect((await call("POST", `${study.id}/coders`, { coders })).status).toBe(201);
      const ids = (await read(`${study.id}/units`)).units.map((u: { id: number }) => u.id);
      const sets = [
        { name: "anna", unitIds: [ids[0]] },
        { name: "bob", unitIds: [ids[1]] },
      ];
      expect((await call("PUT", `${study.id}/sets/coder_set`, { sets })).status).toBe(200);
      return study;
    };
    const coderIds = async (studyId: number) =>
      (await read(`${studyId}/coders`)).coders.map((c: { coder: string }) => c.coder);

    it("isn't chosen when a study is made or changed: null until the first deploy", async () => {
      const study = await createStudy("New");
      expect(study.coderKind).toBeNull();
      // Not an input of the study any more: ignored
      const made = await app.request("/api/study", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ name: "With a kind", coderKind: "expert" }),
      });
      expect((await json(made)).coderKind).toBeNull();
      const changed = await call("PUT", `${study.id}`, { name: "Renamed", coderKind: "expert" });
      expect(changed.status).toBe(200);
      expect(await json(changed)).toMatchObject({ name: "Renamed", coderKind: null });
      // Saving designs records nothing
      await postDesign(study.id, EXPERTS);
      expect(await coderKind(study.id)).toBeNull();
    });

    it("before the first deploy a design is valid with any invitation, or without one", async () => {
      const study = await createStudy("Draft");
      expect((await postDesign(study.id)).valid).toBe(true);
      expect((await postDesign(study.id, CROWD)).valid).toBe(true);
      expect((await postDesign(study.id, EXPERTS)).valid).toBe(true);
      const { versions } = await read(`${study.id}/design`);
      expect(versions.map((v: { valid: boolean }) => v.valid)).toEqual([true, true, true]);
    });

    it("deploying requires an invitation: a design that hasn't chosen who codes is refused", async () => {
      const study = await createStudy("No invitation");
      const none = await postDesign(study.id);
      expect(none.session).toEqual({});
      const refused = await deploy(study.id, none.id);
      expect(refused.status).toBe(400);
      expect(await json(refused)).toEqual({
        error: "Fix the design's issues before deploying it",
        issues: [{ path: [0, "invite"], message: "Choose who codes first: expert coders or a crowd (one link)" }],
      });
      expect(await read(`${study.id}/deployment`)).toBeNull();
      expect(await coderKind(study.id)).toBeNull();
    });

    it("the first deploy records the kind of coders the deployed design invites", async () => {
      const crowd = await createStudy("A crowd");
      expect((await deploy(crowd.id, (await postDesign(crowd.id, CROWD)).id)).status).toBe(200);
      expect(await coderKind(crowd.id)).toBe("crowd");

      const experts = await studyWithExperts("Experts");
      // A draft for the other kind saved before doesn't count: the deployed design does
      await postDesign(experts.id, CROWD);
      const deployed = await deploy(experts.id, (await postDesign(experts.id, EXPERTS)).id);
      expect(deployed.status, await deployed.clone().text()).toBe(200);
      expect(await coderKind(experts.id)).toBe("expert");
    });

    it("is locked after the first deploy: a design for the other kind isn't valid, but saves", async () => {
      const study = await createStudy("Locked");
      const first = await postDesign(study.id, CROWD);
      expect((await deploy(study.id, first.id)).status).toBe(200);

      const other = await call("POST", `${study.id}/design`, { items: [loop], session: EXPERTS });
      expect(other.status).toBe(201);
      const saved = await json(other);
      expect(saved).toMatchObject({ valid: false, session: EXPERTS });
      const refused = await deploy(study.id, saved.id);
      expect(refused.status).toBe(400);
      expect((await json(refused)).issues).toEqual([
        { path: [0, "invite"], message: expect.stringContaining("This study has a crowd since its first deploy") },
      ]);
      // The kind's own invitation deploys, and the kind stays
      const again = await postDesign(study.id, { invite: { mode: "crowd", maxCoders: 5 } });
      expect(again.valid).toBe(true);
      expect((await deploy(study.id, again.id)).status).toBe(200);
      expect(await coderKind(study.id)).toBe("crowd");
      // A draft that hasn't chosen: no kind problem, but it can't be deployed
      const none = await postDesign(study.id);
      expect(none.valid).toBe(true);
      expect((await deploy(study.id, none.id)).status).toBe(400);
    });

    it("units uploaded before any design start a design without an invitation", async () => {
      const study = await createStudy("First units");
      const units = [{ externalId: "u1", data: { text: "A text" } }];
      expect((await call("POST", `${study.id}/units`, { units })).status).toBe(201);
      const { versions } = await read(`${study.id}/design`);
      expect(versions).toHaveLength(1);
      expect((await read(`${study.id}/design/${versions[0].id}`)).session).toEqual({});
    });

    it("a crowd's first deploy deletes the expert coders made before, with their units in coder_set", async () => {
      const study = await studyWithExperts("Crowd after all");
      expect(await coderIds(study.id)).toEqual(["anna", "bob"]);
      const design = await postDesign(study.id, CROWD);
      // Saving the crowd's design deletes nothing
      expect(await coderIds(study.id)).toEqual(["anna", "bob"]);
      expect((await deploy(study.id, design.id)).status).toBe(200);
      expect(await coderIds(study.id)).toEqual([]);
      const columns = await read(`${study.id}/sets`);
      const coderSet = columns.find((g: { name: string }) => g.name === "coder_set");
      expect(coderSet?.sets ?? []).toEqual([]);
      const stored = await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM coders WHERE study_id = $1", [
        study.id,
      ]);
      expect(stored).toEqual([{ n: 0 }]);
    });

    it("expert coders stay at a first deploy with expert coders, and at every later deploy", async () => {
      const study = await studyWithExperts("Experts stay");
      const first = await postDesign(study.id, EXPERTS);
      expect((await deploy(study.id, first.id)).status).toBe(200);
      expect(await coderIds(study.id)).toEqual(["anna", "bob"]);
      const next = await postDesign(study.id, { invite: { mode: "coders", link: "pick_name" } });
      expect((await deploy(study.id, next.id)).status).toBe(200);
      expect(await coderIds(study.id)).toEqual(["anna", "bob"]);
      const anna = (await read(`${study.id}/coders`)).coders[0];
      expect(anna).toMatchObject({ coder: "anna", email: "anna@example.org", assigned: 1 });
    });
  });

  it("rejects study access without a role header", async () => {
    const study = await createStudy();
    const res = await app.request(`/api/study/${study.id}`);
    expect(res.status).toBe(401);
  });
});

describe("codebook routes", () => {
  it("stores a design version's format: the current one unless given, never a newer one", async () => {
    const study = await createStudy();
    const save = (method: string, path: string, body: object) =>
      app.request(`/api/study/${study.id}/design${path}`, {
        method,
        headers: adminHeaders,
        body: JSON.stringify({ items: [], ...body }),
      });
    const made = await json(await save("POST", "", {}));
    expect(made.formatVersion).toBe(DESIGN_FORMAT_VERSION);
    expect((await json(await save("PUT", `/${made.id}`, { note: "again" }))).formatVersion).toBe(DESIGN_FORMAT_VERSION);
    expect((await json(await save("POST", "", { formatVersion: 1 }))).formatVersion).toBe(1);
    const newer = { formatVersion: DESIGN_FORMAT_VERSION + 1 };
    expect((await save("POST", "", newer)).status).toBe(400);
    expect((await save("PUT", `/${made.id}`, newer)).status).toBe(400);
    const recipe = await app.request("/api/study/from-recipe", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "r", design: { items: [], ...newer } }),
    });
    expect(recipe.status).toBe(400);
  });

  it("saves drafts with issues, but only publishes valid design versions", async () => {
    const study = await createStudy();
    const validItems: DesignItem[] = [
      {
        type: "unit_loop",
        id: "loop_1",
        label: "loop",
        units: {},
        children: [
          { type: "layout", template: "" },
          { type: "question", name: "q1", variable: { type: "confirm", question: "Confirm?" } },
        ],
      },
    ];
    const post = (items: unknown, session: object = { invite: { mode: "crowd" } }) =>
      app.request(`/api/study/${study.id}/design`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ items, session }),
      });
    const publish = (designVersionId: number) =>
      app.request(`/api/study/${study.id}/deployment`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ designVersionId }),
      });

    // Work in progress: a span question outside a loop
    const bad = await post([
      {
        type: "question",
        name: "q1",
        variable: { type: "span", question: "?", fields: ["text"], options: [{ value: "x" }] },
      },
    ]);
    expect(bad.status).toBe(201);
    const draft = await json(bad);
    expect(draft).toMatchObject({ valid: false, revision: 1, updatedBy: "dev@localhost", immutable: false });
    const refused = await publish(draft.id);
    expect(refused.status).toBe(400);
    expect((await json(refused)).issues.length).toBeGreaterThan(0);

    expect((await post("not a list")).status).toBe(400);

    // No invitation: saved without issues, but who codes isn't chosen, so not deployed
    const open = await json(await post(validItems, {}));
    expect(open.valid).toBe(true);
    const unchosen = await publish(open.id);
    expect(unchosen.status).toBe(400);
    expect((await json(unchosen)).issues).toEqual([
      { path: [0, "invite"], message: "Choose who codes first: expert coders or a crowd (one link)" },
    ]);

    const good = await json(await post(validItems));
    expect(good.valid).toBe(true);
    expect((await publish(good.id)).status).toBe(200);
  });

  it("refuses a save based on an older revision", async () => {
    const study = await createStudy();
    const items = [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }];
    const draft = await json(
      await app.request(`/api/study/${study.id}/design`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ items }),
      }),
    );
    const put = (revision: number | undefined, headers = adminHeaders) =>
      app.request(`/api/study/${study.id}/design/${draft.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ items, revision }),
      });

    // Jane saves first (revision 1 -> 2)
    const jane = { ...adminHeaders, "x-dev-email": "jane@uni.nl" };
    expect((await json(await put(1, jane))).revision).toBe(2);
    // Our edits were based on revision 1
    const stale = await put(1);
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: "design_conflict", updatedBy: "jane@uni.nl", revision: 2 });
    // Overwrite on purpose: without a revision, or with the current one
    expect((await json(await put(2))).revision).toBe(3);
    expect((await json(await put(undefined))).revision).toBe(4);
  });
});

describe("units: fields and pages", () => {
  it("refuses an uploaded column answer_<x> or feedback_<x> unless <x> is a question of the design", async () => {
    const study = await createStudy();
    const upload = (data: object) =>
      app.request(`/api/study/${study.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data }], overwrite: true }),
      });
    const refused = await upload({ text: "a", answer_text: "b" });
    expect(refused.status).toBe(400);
    expect((await json(refused)).error).toContain("answer_ and feedback_ are reserved");
    const question = { type: "question", name: "topic", variable: { type: "confirm", question: "?" } };
    const loop = { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }, question] };
    await app.request(`/api/study/${study.id}/design`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(splitDesignItems([loop])),
    });
    expect((await upload({ text: "a", answer_topic: "x", feedback_topic: "No" })).status).toBe(201);
    expect((await upload({ text: "a", answer_topic: "x", feedback_topic: "No", feedback_other: "?" })).status).toBe(
      400,
    );
  });

  async function upload(studyId: number, units: object[], overwrite = false) {
    return app.request(`/api/study/${studyId}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, overwrite }),
    });
  }

  it("takes the fields from the first upload and checks later ones against them", async () => {
    const study = await createStudy();
    expect((await upload(study.id, [{ externalId: "u1", data: { n: 1, t: "a" } }])).status).toBe(201);
    const fields = await json(await app.request(`/api/study/${study.id}/units/fields`, { headers: adminHeaders }));
    expect(fields).toEqual([
      { name: "n", type: "number" },
      { name: "t", type: "text" },
    ]);

    // wrong type, or a missing field: nothing is stored
    const bad = await upload(study.id, [
      { externalId: "u2", data: { n: 2, t: "b" } },
      { externalId: "u3", data: { n: "3", t: "c" } },
    ]);
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatch(/u3.*'n' is number/);
    expect((await upload(study.id, [{ externalId: "u2", data: { n: 2 } }])).status).toBe(400);
    // a new field needs a valid name
    expect(
      (await json(await upload(study.id, [{ externalId: "u2", data: { n: 2, t: "b", "a b": 1 } }]))).error,
    ).toMatch(/'a b'/);
    const listed = await json(await app.request(`/api/study/${study.id}/units`, { headers: adminHeaders }));
    expect(listed.units).toHaveLength(1);

    // empty values fit any type
    expect((await upload(study.id, [{ externalId: "u2", data: { n: null, t: "b" } }])).status).toBe(201);

    // a later upload may add fields; the units already stored have no value for them
    expect((await upload(study.id, [{ externalId: "u3", data: { n: 3, t: "c", ok: true } }])).status).toBe(201);
    expect(await json(await app.request(`/api/study/${study.id}/units/fields`, { headers: adminHeaders }))).toEqual([
      { name: "n", type: "number" },
      { name: "t", type: "text" },
      { name: "ok", type: "boolean" },
    ]);
  });

  it("resets the fields when all units are deleted", async () => {
    const study = await createStudy();
    const [unit] = await json(await upload(study.id, [{ externalId: "u1", data: { n: 1 } }]));
    await app.request(`/api/study/${study.id}/units/${unit.id}`, { method: "DELETE", headers: adminHeaders });
    expect((await upload(study.id, [{ externalId: "u1", data: { other: "x" } }])).status).toBe(201);
  });

  it("pages units, or a set's units in its order", async () => {
    const study = await createStudy();
    const units = (await json(
      await upload(
        study.id,
        Array.from({ length: 5 }, (_, i) => ({ externalId: `u${i}`, data: { i } })),
      ),
    )) as { id: number }[];
    const put = await app.request(`/api/study/${study.id}/sets/part_set`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        sets: [
          { name: "set", unitIds: [units[4].id, units[0].id, units[2].id], ordered: true },
          { name: "other", unitIds: [units[1].id] },
        ],
      }),
    });
    expect(put.status).toBe(200);
    expect(await json(put)).toEqual({
      name: "part_set",
      sets: [
        { name: "other", unitIds: [units[1].id], ordered: false },
        { name: "set", unitIds: [units[4].id, units[0].id, units[2].id], ordered: true },
      ],
    });
    const page = async (query: string) =>
      json(await app.request(`/api/study/${study.id}/units/page?${query}`, { headers: adminHeaders }));

    const all = await page("offset=1&limit=2");
    expect(all.total).toBe(5);
    expect(all.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u1", "u2"]);
    const set = await page("column=part_set&set=set&offset=1&limit=5");
    expect(set.total).toBe(3);
    expect(set.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u0", "u2"]);
    expect(
      (await json(await app.request(`/api/study/${study.id}/overview`, { headers: adminHeaders }))).groups,
    ).toEqual([
      {
        name: "part_set",
        sets: [
          { name: "other", units: 1 },
          { name: "set", units: 3 },
        ],
      },
    ]);
    // Deleted: gone (no codebook uses it)
    expect(
      (await app.request(`/api/study/${study.id}/sets/part_set`, { method: "DELETE", headers: adminHeaders })).status,
    ).toBe(204);
    expect(await json(await app.request(`/api/study/${study.id}/sets`, { headers: adminHeaders }))).toEqual([]);
  });

  it("keeps sets to the study's own units, in the columns with a role, with valid names", async () => {
    const study = await createStudy();
    const other = await createStudy("Other");
    const [mine] = await json(await upload(study.id, [{ externalId: "u1", data: { n: 1 } }]));
    const [theirs] = await json(await upload(other.id, [{ externalId: "u1", data: { n: 1 } }]));
    const put = (group: string, sets: object[]) =>
      app.request(`/api/study/${study.id}/sets/${group}`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ sets }),
      });
    expect((await put("part_set", [{ name: "s", unitIds: [mine.id, theirs.id] }])).status).toBe(400);
    expect((await put("part_set", [{ name: "a;b", unitIds: [mine.id] }])).status).toBe(400);
    expect(
      (
        await put("part_set", [
          { name: "s", unitIds: [mine.id] },
          { name: "s", unitIds: [] },
        ])
      ).status,
    ).toBe(400);
    // Only the columns with a role; test_set takes the test unit types, one per unit
    expect((await put("batch", [{ name: "s", unitIds: [mine.id] }])).status).toBe(400);
    expect((await put("test_set", [{ name: "_gold", unitIds: [mine.id] }])).status).toBe(400);
    expect(
      (
        await put("test_set", [
          { name: "gold", unitIds: [mine.id] },
          { name: "practice", unitIds: [mine.id] },
        ])
      ).status,
    ).toBe(400);
    expect((await put("part_set", [{ name: "s", unitIds: [mine.id] }])).status).toBe(200);
    expect((await put("test_set", [{ name: "gold", unitIds: [mine.id] }])).status).toBe(200);
    const fields = await json(await app.request(`/api/study/${study.id}/units/fields`, { headers: adminHeaders }));
    expect(fields).toEqual(
      expect.arrayContaining([
        { name: "part_set", type: "set" },
        { name: "test_set", type: "test_set" },
      ]),
    );
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

/** Deploys a design with one loop (and the study's units); its design version's id. */
async function deployConfirmLoop(studyId: number): Promise<number> {
  const question = { type: "question", name: "q", variable: { type: "confirm", question: "?" } };
  const loop = { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }, question] };
  const version = await json(
    await app.request(`/api/study/${studyId}/design`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ items: [loop], session: { invite: { mode: "crowd" } } }),
    }),
  );
  const deployed = await app.request(`/api/study/${studyId}/deployment`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: version.id, units: true }),
  });
  expect(deployed.status).toBe(200);
  return version.id as number;
}

describe("annotations: finished counts and resets", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, values: [{ value: code }] });

  async function setup() {
    const study = await createStudy();
    const store = new DbStore(db, study.id);
    const units = (await json(
      await app.request(`/api/study/${study.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          units: [
            { externalId: "u1", data: {} },
            { externalId: "u2", data: {} },
          ],
        }),
      }),
    )) as { id: number }[];
    // Deployed: answers name the design version and the unit version they were given under
    const designVersionId = await deployConfirmLoop(study.id);
    await query(db, "INSERT INTO links (study_id, label, secret) VALUES ($1, 'x', 'annotations-link')", [study.id]);
    const { coder } = await store.resolveCoder({ coderKey: "k", linkSecret: "annotations-link" });
    const put = (unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, sessionId: coder.sessionId, variables, designVersionId });
    const finished = (variables: string[], values?: string[]) =>
      store.listFinished({ loops: [{ loop: "l", variables, values }] });
    return { study, units, coder, put, finished };
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
    const rows = await query<{ variable: string; value: VariableValue }>(
      db,
      "SELECT variable, value FROM annotation_values WHERE retired_at IS NULL ORDER BY variable",
    );
    expect(rows.map((r) => [r.variable, r.value.values?.[0].value])).toEqual([
      ["old", "x"],
      ["q1", "b"],
    ]);
    expect(await finished(["q1"])).toHaveLength(1);
  });

  it("resets by retiring values: they stay, but no longer count", async () => {
    const { study, units, put, finished } = await setup();
    await app.request(`/api/study/${study.id}/deployment`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: 1 }),
    });
    await put(units[0].id, { q1: value("a") });
    await put(units[1].id, { q1: value("a") });

    const res = await app.request(`/api/study/${study.id}/annotations/reset`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["q1"], unitIds: [units[0].id] }),
    });
    expect(await json(res)).toEqual({ retired: 1 });
    expect(await query(db, "SELECT event, details FROM security_log WHERE event = 'answers_reset'")).toEqual([
      { event: "answers_reset", details: { studyId: study.id, retired: 1 } },
    ]);
    expect((await finished(["q1"])).map((f) => f.unitId)).toEqual([units[1].id]);
    // recoded after the reset: a new live row next to the retired one
    await put(units[0].id, { q1: value("b") });
    expect(
      await query(db, "SELECT COUNT(*)::int AS n FROM annotation_values WHERE unit_id = $1", [units[0].id]),
    ).toEqual([{ n: 2 }]);
    expect(await finished(["q1"])).toHaveLength(2);
  });
});

describe("links, coder progress and overview", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, values: [{ value: code }] });

  /** Sets the coders of `coder_set` (one empty set each), made expert coders first. */
  const setCoders = async (studyId: number, names: string[]) => {
    const { coders: known } = await json(await app.request(`/api/study/${studyId}/coders`, { headers: adminHeaders }));
    const fresh = names.filter((name) => !known.some((c: { coder: string }) => c.coder === name));
    if (fresh.length > 0) {
      const made = await app.request(`/api/study/${studyId}/coders`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ coders: fresh.map((coder) => ({ coder })) }),
      });
      expect(made.status, await made.clone().text()).toBe(201);
    }
    const res = await app.request(`/api/study/${studyId}/sets/coder_set`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ sets: names.map((name) => ({ name, unitIds: [] })) }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  };
  const coders = { type: "session", invite: { mode: "coders", link: "per_coder" } };

  async function setup(names?: string[]) {
    const session = names ? coders : { type: "session", invite: { mode: "crowd" } };
    const study = await createStudy("Test study");
    const store = new DbStore(db, study.id);
    const units = (await json(
      await app.request(`/api/study/${study.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          units: [
            { externalId: "u1", data: {} },
            { externalId: "u2", data: {} },
          ],
        }),
      }),
    )) as { id: number }[];
    const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
    const loop = {
      type: "unit_loop",
      id: "loop_1",
      label: "l",
      units: {},
      children: [{ type: "layout", template: "" }, question("q1"), question("q2")],
    };
    if (names) await setCoders(study.id, names);
    let designVersionId = 0;
    const publish = async (items: object[], confirmLinks?: boolean) => {
      const codebook = await json(
        await app.request(`/api/study/${study.id}/design`, {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify(splitDesignItems(items)),
        }),
      );
      designVersionId = codebook.id;
      return app.request(`/api/study/${study.id}/deployment`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ designVersionId: codebook.id, units: true, confirmLinks }),
      });
    };
    expect((await publish([session, loop])).status).toBe(200);
    const resolve = async (coderKey: string, linkSecret: string) =>
      (await store.resolveCoder({ coderKey, linkSecret })).coder;
    const put = (sessionId: number, unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, sessionId, variables, designVersionId });
    const get = async (path: string) =>
      json(await app.request(`/api/study/${study.id}${path}`, { headers: adminHeaders }));
    return { study, units, loop, publish, resolve, put, get };
  }
  it("makes a link per coder; links are revoked, renewed or retired, never deleted", async () => {
    const { study, loop, publish, resolve, get } = await setup(["used", "waiting"]);
    const { links } = await get("/links");
    expect(links.map((i: { label: string; params: object }) => [i.label, i.params])).toEqual([
      ["used", { coder: "used" }],
      ["waiting", { coder: "waiting" }],
    ]);
    const [used, unused] = links;
    expect(await status(resolve("a", used.secret))).toBe(200);
    expect((await get("/links")).links[0].uses).toBe(1);

    // A new secret: the old one stops working
    const renewed = await json(
      await app.request(`/api/study/${study.id}/links/${used.id}/secret`, { method: "POST", headers: adminHeaders }),
    );
    expect(renewed.secret).not.toBe(used.secret);
    expect(await status(resolve("b", used.secret))).toBe(404); // link_not_found

    const revoked = await json(
      await app.request(`/api/study/${study.id}/links/${used.id}/revoke`, { method: "POST", headers: adminHeaders }),
    );
    expect(revoked.revokedAt).not.toBeNull();
    expect(await status(resolve("c", renewed.secret))).toBe(403); // link_revoked
    // coders who already started keep their access
    expect(await status(resolve("a", used.secret))).toBe(200);
    // Reopened: new coders again
    const reopened = await json(
      await app.request(`/api/study/${study.id}/links/${used.id}/reopen`, { method: "POST", headers: adminHeaders }),
    );
    expect(reopened.revokedAt).toBeNull();
    expect(await status(resolve("c2", renewed.secret))).toBe(200);

    // Republished with other coders: "waiting" is retired, "new" made; "used" keeps its row
    await setCoders(study.id, ["used", "zeta"]);
    expect((await publish([coders, loop])).status).toBe(200);
    const after = (await get("/links")).links;
    expect(
      after.map((i: { params: { coder: string }; retiredAt: string | null }) => [i.params.coder, i.retiredAt === null]),
    ).toEqual([
      ["used", true],
      ["zeta", true],
      ["waiting", false],
    ]);
    expect(await status(resolve("d", unused.secret))).toBe(403);
  });

  it("asks to confirm many links, and refuses too many", async () => {
    const { study, loop, publish } = await setup(["b0"]);
    const many = (n: number) =>
      setCoders(
        study.id,
        Array.from({ length: n }, (_, i) => `b${i}`),
      );
    await many(501);
    const confirm = await publish([coders, loop]);
    expect(confirm.status).toBe(409);
    expect(await json(confirm)).toMatchObject({ code: "confirm_links" });
    await many(2001);
    expect((await publish([coders, loop], true)).status).toBe(400);
    await many(501);
    const ok = await publish([coders, loop], true);
    expect(ok.status).toBe(200);
    expect((await json(ok)).links).toBe(501);
  });

  it("reports coder progress and the overview from live answers", async () => {
    const { units, resolve, put, get } = await setup(["batch 1"]);
    const [link] = (await get("/links")).links;
    const coderA = await resolve("a", link.secret);
    await resolve("b", link.secret);
    await put(coderA.sessionId, units[0].id, { q1: value("x"), q2: value("y") });
    await put(coderA.sessionId, units[1].id, { q1: value("x") });

    const { sessions: coders } = await get("/sessions");
    expect(coders[0]).toMatchObject({
      linkLabel: "batch 1",
      answers: 3,
      finished: [{ loop: "loop_1", title: "l", units: 1 }],
    });
    expect(coders[0].lastActive).not.toBeNull();
    expect(coders[1]).toMatchObject({
      answers: 0,
      lastActive: null,
      finished: [{ loop: "loop_1", title: "l", units: 0 }],
    });

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

describe("health checks", () => {
  it("/api/health says the process is up without asking the database; /api/ready asks it", async () => {
    const down = { execute: () => Promise.reject(new Error("connection refused")) } as unknown as Db;
    const health = await createApp(down).request("/api/health");
    expect(health.status).toBe(200);
    expect(await json(health)).toMatchObject({ ok: true, service: "annotinder" });

    const ready = await app.request("/api/ready");
    expect(ready.status).toBe(200);
    expect(await json(ready)).toEqual({ ok: true, service: "annotinder", database: true });
    const notReady = await createApp(down).request("/api/ready");
    expect(notReady.status).toBe(503);
    expect(await json(notReady)).toEqual({ ok: false, service: "annotinder", database: false });
  });

  it("a database that doesn't answer in time is not ready", async () => {
    const { databaseAnswers } = await import("../db/index.js");
    const hangs = { execute: () => new Promise(() => undefined) } as unknown as Db;
    expect(await databaseAnswers(hangs, 20)).toBe(false);
    expect(await databaseAnswers(db)).toBe(true);
  });
});

describe("the server's information page", () => {
  it("/api/info gives what the operator set and the version, without authentication", async () => {
    const info = {
      operator: "The Example Lab",
      hosting: "A university data centre in Exampletown",
      contact: "annotinder@example.org",
      privacyUrl: "https://example.org/privacy",
      termsUrl: null,
    };
    const res = await createApp(db, { info }).request("/api/info");
    expect(res.status).toBe(200);
    expect(ServerInfoSchema.parse(await json(res))).toEqual({ ...info, version: CLIENT_VERSION });
  });

  it("says null for what is not set", async () => {
    expect(await json(await app.request("/api/info"))).toEqual({
      operator: null,
      hosting: null,
      contact: null,
      privacyUrl: null,
      termsUrl: null,
      version: CLIENT_VERSION,
    });
  });
});

describe("security headers", () => {
  it("sends nosniff, a referrer policy and no framing by others; a CSP on pages; HSTS over HTTPS", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull(); // JSON: no policy needed

    const { contentSecurityPolicy } = await import("../shared/securityHeaders.js");
    const csp = contentSecurityPolicy({ frameAncestors: ["https://amcat.example"] });
    expect(csp).toContain("frame-ancestors 'self' https://amcat.example");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-");

    // The client's pages get the policy
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "client-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>x</title>");
    const page = await createApp(db, { clientDir: dir }).request("/some/page");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(page.headers.get("x-frame-options")).toBe("SAMEORIGIN");

    // Built files are cached for good; one that isn't there is not the app's page under a script's name
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "index-abc.js"), "1");
    const client = createApp(db, { clientDir: dir });
    const asset = await client.request("/assets/index-abc.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const missing = await client.request("/assets/index-old.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBeNull();

    const secure = createApp(db, { https: true });
    expect((await secure.request("/api/health")).headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});

describe("request body limits", () => {
  const send = (path: string, method: string, bytes: number) =>
    app.request(path, { method, headers: adminHeaders, body: JSON.stringify({ padding: "x".repeat(bytes) }) });
  const KB = 1024;
  const MB = 1024 * KB;

  it("only the routes that take a study's units accept large bodies; 413 request_too_large otherwise", async () => {
    const study = await createStudy();
    const tooLarge = async (res: Response) => {
      expect(res.status).toBe(413);
      expect(await json(res)).toMatchObject({ code: "request_too_large" });
    };
    await tooLarge(await send(`/api/study/${study.id}/design`, "POST", 5 * MB));
    await tooLarge(await send(`/api/study/${study.id}/sets/train`, "PUT", 5 * MB));
    await tooLarge(await send("/api/coder/settings", "PUT", 100 * KB));
    await tooLarge(await send("/api/me/researcher-request", "POST", 100 * KB));
    await tooLarge(await send("/api/auth/logout", "POST", 100 * KB));
    await tooLarge(await send("/api/d/demostudy001/variables/unit", "POST", 3 * MB));
    // Units, an imported study and a study from a recipe: read, and refused for what they say
    for (const path of [`/api/study/${study.id}/units`, "/api/study/import", "/api/study/from-recipe"])
      expect((await send(path, "POST", 5 * MB)).status).toBe(400);
    // Within the limit: a design that isn't one
    expect((await send(`/api/study/${study.id}/design`, "POST", 3 * MB)).status).toBe(400);
  });
});
