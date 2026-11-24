import { beforeEach, describe, expect, it } from "vitest";
import {
  AnnotationPageSchema,
  CoderProgressSchema,
  ExampleSummarySchema,
  StudyResponseSchema,
  type AnnotationRow,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser, setServerRole } from "../shared/accounts.js";
import { listExamples } from "../examples.js";
import { emptyDb, query } from "./testDb.js";

// Example studies (docs/examples.md): every example makes a working study,
// with valid example answers, that a coder can start coding.

let db: Db;
let app: ReturnType<typeof createApp>;
let key: string;

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db);
  const user = await ensureUser(db, "r@uni.nl");
  await setServerRole(db, user.id, "researcher");
  key = (await createApiKey(db, user.id, "test")).key;
});

const researcher = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${key}` } });

describe("example studies", () => {
  it("lists the catalogue", async () => {
    const examples = ExampleSummarySchema.array().parse(await (await researcher("/api/examples")).json());
    expect(examples.map((e) => e.id).sort()).toEqual([
      "actor-spans",
      "gold-practice",
      "simple-experiment",
      "simple-survey",
      "survey-annotations",
      "swipe-sentiment",
      "tour",
    ]);
  });

  it.each(listExamples().map((e) => e.id))(
    "%s makes a study that can be coded, with its example answers",
    async (id) => {
      const res = await researcher("/api/study/from-example", {
        method: "POST",
        body: JSON.stringify({ example: id }),
      });
      expect(res.status).toBe(201);
      const study = StudyResponseSchema.parse(await res.json());
      expect(study.origin).toBe(id);

      // The researcher owns it, and it is deployed with an invitation
      expect((await researcher(`/api/study/${study.id}`)).status).toBe(200);
      const { links } = (await (await researcher(`/api/study/${study.id}/links`)).json()) as {
        links: { secret: string }[];
      };
      const [link] = links;
      expect(
        (await (await researcher(`/api/study/${study.id}/deployment`)).json()) as { active: boolean },
      ).toMatchObject({ active: true });

      // Example answers: every coder's answers are in the download
      const coders = CoderProgressSchema.array().parse(
        ((await (await researcher(`/api/study/${study.id}/coders`)).json()) as { coders: unknown }).coders,
      );
      const page = AnnotationPageSchema.parse(
        await (await researcher(`/api/study/${study.id}/annotations?limit=10000`)).json(),
      );
      const answered = new Set(page.annotations.map((a: AnnotationRow) => a.sessionId));
      expect(coders.every((c) => answered.has(c.id))).toBe(true);
      // Their finished units count (every question of the loop answered)
      const units = page.annotations.filter((a) => a.unitId !== null).length;
      if (units > 0) expect(coders.some((c) => c.finished.some((loop) => loop.units > 0))).toBe(true);
      // Given over several past days, never in the future
      if (units > 0) {
        const days = new Set(
          page.annotations.map((a: AnnotationRow) => new Date(a.created).toISOString().slice(0, 10)),
        );
        expect(days.size).toBeGreaterThan(1);
        expect(page.annotations.every((a: AnnotationRow) => new Date(a.created).getTime() <= Date.now())).toBe(true);
      }

      // A coder can start
      const coder = await app.request(`/api/d/${study.publicId}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": link.secret },
      });
      expect(coder.status).toBe(200);
    },
  );

  it("counts against the researcher's limit on studies", async () => {
    const plan = await query<{ id: number }>(
      db,
      "INSERT INTO plans (name, limits) VALUES ('One', '{\"studies\": 1}') RETURNING id",
    );
    await query(db, "UPDATE users SET plan_id = $1", [plan[0].id]);
    expect(
      (await researcher("/api/study/from-example", { method: "POST", body: JSON.stringify({ example: "nope" }) }))
        .status,
    ).toBe(404);
    expect(
      (await researcher("/api/study/from-example", { method: "POST", body: JSON.stringify({ example: "tour" }) }))
        .status,
    ).toBe(201);
    const second = await researcher("/api/study/from-example", {
      method: "POST",
      body: JSON.stringify({ example: "tour" }),
    });
    expect(await second.json()).toMatchObject({ code: "limit_reached" });
  });
});

describe("studies from a recipe", () => {
  const units = [
    { id: "a", data: { text: "one" } },
    { id: "b", data: { text: "two" } },
  ];
  const items = [
    { type: "experiment", name: "condition", variable: { type: "experiment", draw: "random", selectsUnits: true } },
    {
      type: "unit_loop",
      id: "loop_1",
      children: [
        { type: "layout", template: "$unit.text" },
        { type: "question", name: "topic", variable: { type: "unspecified" } },
      ],
    },
  ];
  const recipe = {
    name: "From a design file",
    units,
    sets: [
      {
        column: "condition_set",
        sets: [
          { name: "x", units: ["a"] },
          { name: "y", units: ["b"] },
        ],
      },
    ],
    design: { items },
  };
  const post = (body: object) => researcher("/api/study/from-recipe", { method: "POST", body: JSON.stringify(body) });
  const studyCount = async () => (await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM studies"))[0].n;

  it("makes the units, columns with a role and a draft design; deploying makes its links", async () => {
    const res = await post(recipe);
    expect(res.status).toBe(201);
    const study = StudyResponseSchema.parse(await res.json());
    expect(study.name).toBe("From a design file");
    const groups = (await (await researcher(`/api/study/${study.id}/sets`)).json()) as {
      name: string;
      sets: { name: string; unitIds: number[] }[];
    }[];
    expect(groups.map((g) => [g.name, g.sets.map((s) => [s.name, s.unitIds.length])])).toEqual([
      [
        "condition_set",
        [
          ["x", 1],
          ["y", 1],
        ],
      ],
    ]);
    // A draft with a question to specify: saved, not deployed
    const { versions: designVersions } = (await (await researcher(`/api/study/${study.id}/design`)).json()) as {
      versions: { items: unknown[] }[];
    };
    expect(designVersions).toHaveLength(1);
    // Its columns with a role are unit fields of their type
    const [{ units: spec }] = await query<{ units: { fields: unknown[] } }>(
      db,
      "SELECT units FROM design_versions WHERE study_id = $1",
      [study.id],
    );
    expect(spec.fields).toEqual([
      { name: "text", type: "text" },
      { name: "condition_set", type: "set" },
    ]);
    expect(await (await researcher(`/api/study/${study.id}/deployment`)).json()).toBeNull();
    expect(((await (await researcher(`/api/study/${study.id}/links`)).json()) as { links: unknown[] }).links).toEqual(
      [],
    );

    // Published (the question specified): one open link
    const specified = structuredClone(items);
    // (Its first child is the layout item)
    (specified[1] as { children: { variable: object }[] }).children[1].variable = { type: "confirm", question: "?" };
    const published = await post({ ...recipe, design: { items: specified }, deploy: true });
    expect(published.status, await published.clone().text()).toBe(201);
    const { id } = StudyResponseSchema.parse(await published.json());
    expect(
      ((await (await researcher(`/api/study/${id}/links`)).json()) as { links: { label: string }[] }).links.map(
        (l) => l.label,
      ),
    ).toEqual(["Open link"]);
  });

  it("publishes only a valid codebook; a refused recipe leaves nothing", async () => {
    const res = await post({ ...recipe, deploy: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "recipe_invalid",
      error: expect.stringContaining("no answer type yet"),
    });
    expect((await post({ ...recipe, units: [...units, { id: "a", data: { text: "again" } }] })).status).toBe(400);
    expect(
      (await post({ ...recipe, sets: [{ column: "part_set", sets: [{ name: "s", units: ["nope"] }] }] })).status,
    ).toBe(400);
    // Only the columns with a role
    expect((await post({ ...recipe, sets: [{ column: "g", sets: [{ name: "s", units: ["a"] }] }] })).status).toBe(400);
    expect(await studyCount()).toBe(0);
  });

  it("a design file's unit fields: declared types, descriptions and order", async () => {
    const res = await post({
      ...recipe,
      units: [
        { id: "a", data: { text: "one", picture: "https://example.org/a.png", extra: 1 } },
        { id: "b", data: { text: "two", picture: "https://example.org/b.png", extra: 2 } },
      ],
      design: {
        items,
        units: {
          fields: [
            { name: "condition_set", type: "set", description: "The experimental condition" },
            { name: "picture", type: "text", description: "Where the picture is" },
            { name: "text", type: "text", description: "The article" },
          ],
        },
      },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const study = StudyResponseSchema.parse(await res.json());
    const [{ units: spec }] = await query<{ units: { fields: unknown[] } }>(
      db,
      "SELECT units FROM design_versions WHERE study_id = $1",
      [study.id],
    );
    // Declared ones in their order, then a field only the units have
    expect(spec.fields).toEqual([
      { name: "condition_set", type: "set", description: "The experimental condition" },
      { name: "picture", type: "text", description: "Where the picture is" },
      { name: "text", type: "text", description: "The article" },
      { name: "extra", type: "number" },
    ]);
    // Values that don't fit a declared type are refused
    const wrong = await post({
      ...recipe,
      design: { items, units: { fields: [{ name: "text", type: "number" }] } },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "recipe_invalid", error: expect.stringContaining("'text'") });
  });

  it("counts against the researcher's limit on studies", async () => {
    const plan = await query<{ id: number }>(
      db,
      "INSERT INTO plans (name, limits) VALUES ('One', '{\"studies\": 1}') RETURNING id",
    );
    await query(db, "UPDATE users SET plan_id = $1", [plan[0].id]);
    expect((await post(recipe)).status).toBe(201);
    expect(await (await post(recipe)).json()).toMatchObject({ code: "limit_reached" });
  });
});
