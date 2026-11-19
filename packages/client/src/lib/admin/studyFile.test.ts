import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { EMPTY_SESSION, RecipeSchema, designFile, type StudyResponse } from "@annotinder/contracts";
import { readStudyFile, studyFile } from "./studyFile";

const study = {
  id: 7,
  name: "Framing",
  created: new Date("2026-11-01"),
  archived: false,
  keepSessionsOpen: true,
  signIn: "optional",
  redirectUrls: { panel: "https://panel.example/done" },
} as StudyResponse;

const design = {
  note: "v3",
  public: { title: "News study" },
  session: EMPTY_SESSION,
  units: {
    fields: [
      { name: "text", type: "text" as const, description: "The article" },
      { name: "frame", type: "set" as const },
    ],
  },
  items: [
    {
      type: "unit_loop",
      layout: { template: "$unit.text" },
      children: [{ type: "question", name: "tone", variable: { type: "confirm", question: "?" } }],
    },
  ],
} as never;

const units = [
  { id: 11, externalId: "a", data: { text: "One" } },
  { id: 12, externalId: "b", data: { text: "Two" } },
];
const groups = [
  {
    name: "frame",
    sets: [
      { name: "economic", unitIds: [12, 11], ordered: true },
      { name: "moral", unitIds: [11], ordered: false },
    ],
  },
];
const client = { release: "0.1.0", commit: "abc1234" };

const file = () => studyFile(study, design, units, groups, client, new Date("2026-11-19T10:00:00Z"));
const zipped = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe("the study file", () => {
  it("is a recipe: units by their ids, sets by unit ids in order, the design as a draft, the settings", () => {
    const f = file();
    expect(f).toMatchObject({ format: "annotinder-study", formatVersion: 1, client });
    expect(f.recipe.units).toEqual([
      { id: "a", data: { text: "One" } },
      { id: "b", data: { text: "Two" } },
    ]);
    expect(f.recipe.sets).toEqual([
      {
        group: "frame",
        sets: [
          { name: "economic", units: ["b", "a"], ordered: true },
          { name: "moral", units: ["a"], ordered: false },
        ],
      },
    ]);
    expect(f.recipe.design).toMatchObject({ note: "v3", public: { title: "News study" }, units: design["units"] });
    expect(f.recipe).toMatchObject({
      signIn: "optional",
      keepSessionsOpen: true,
      redirectUrls: { panel: "https://panel.example/done" },
      publish: false,
    });
    expect(RecipeSchema.safeParse(f.recipe).success).toBe(true);
  });

  it("a study without a design yet has an empty one", () => {
    expect(studyFile(study, null, [], [], client).recipe.design).toEqual({ items: [] });
  });
});

describe("reading a file to import", () => {
  it("a download (.zip): its study.json, as a recipe that is never deployed", () => {
    const f = file();
    const read = readStudyFile(
      "Framing_2026-11-19.zip",
      zipped({ "README.txt": "…", "study.json": JSON.stringify({ ...f, recipe: { ...f.recipe, publish: true } }) }),
    );
    expect(read).toMatchObject({
      kind: "study",
      units: 2,
      sets: [{ name: "frame", sets: 2 }],
      items: 1,
      release: "0.1.0",
    });
    expect(read.recipe.publish).toBe(false);
    expect(RecipeSchema.parse(read.recipe).units).toHaveLength(2);
  });

  it("a study.json on its own", () => {
    const read = readStudyFile("study.json", strToU8(JSON.stringify(file())));
    expect(read.kind).toBe("study");
  });

  it("a design file: the design alone, with its unit fields and the study's name", () => {
    const f = designFile(design as never, { name: "Framing", version: 3, client });
    const read = readStudyFile("v3.json", strToU8(JSON.stringify(f)));
    expect(read).toMatchObject({ kind: "design", units: 0, sets: [], items: 1 });
    expect(read.recipe).toMatchObject({ name: "Framing", design: { note: "v3", units: design["units"] } });
    expect(RecipeSchema.safeParse(read.recipe).success).toBe(true);
  });

  it("says what is wrong with other files", () => {
    expect(() => readStudyFile("old.zip", zipped({ "annotations.csv": "a,b" }))).toThrow(/no study.json/);
    expect(() => readStudyFile("x.json", strToU8("not json"))).toThrow(/can't be read as JSON/);
    expect(() => readStudyFile("x.json", strToU8(JSON.stringify({ hello: 1 })))).toThrow(/isn't an AnnoTinder/);
    expect(() =>
      readStudyFile("x.json", strToU8(JSON.stringify({ ...file(), formatVersion: 99, client: { release: "9.0.0" } }))),
    ).toThrow(/newer AnnoTinder \(9.0.0\)/);
    expect(() => readStudyFile("x.json", strToU8(JSON.stringify({ ...file(), recipe: { name: "" } })))).toThrow(
      /can't be imported/,
    );
  });
});
