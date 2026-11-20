import { describe, expect, it } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { EMPTY_SESSION, RecipeSchema, designFile } from "@annotinder/contracts";
import { readDesignFile, readExportSummary } from "./designImport";

const design = {
  note: "v3",
  public: { title: "News study" },
  session: EMPTY_SESSION,
  units: { fields: [{ name: "text", type: "text" as const, description: "The article" }] },
  items: [
    {
      type: "unit_loop",
      layout: { template: "$unit.text" },
      children: [{ type: "question", name: "tone", variable: { type: "confirm", question: "?" } }],
    },
  ],
} as never;
const client = { release: "0.1.0", commit: "abc1234" };
const bytes = (value: unknown) => strToU8(typeof value === "string" ? value : JSON.stringify(value));

describe("a new study from a design file", () => {
  it("the design as a draft, with its unit fields and the study's name; never deployed", () => {
    const read = readDesignFile(bytes(designFile(design, { name: "Framing", version: 3, client })));
    expect(read).toMatchObject({ items: 1, release: "0.1.0" });
    expect(read.recipe).toMatchObject({
      name: "Framing",
      publish: false,
      design: { note: "v3", units: { fields: [{ name: "text" }] } },
    });
    expect(RecipeSchema.safeParse(read.recipe).success).toBe(true);
  });

  it("says what is wrong with other files", () => {
    expect(() => readDesignFile(bytes("not json"))).toThrow(/can't be read as JSON/);
    expect(() => readDesignFile(bytes({ hello: 1 }))).toThrow(/isn't an AnnoTinder design file/);
    const f = designFile(design, { name: "x", version: 1, client: { release: "9.0.0", commit: "x" } });
    expect(() => readDesignFile(bytes({ ...f, formatVersion: 99 }))).toThrow(/newer AnnoTinder \(9.0.0\)/);
    expect(() => readDesignFile(bytes({ ...f, design: {} }))).toThrow(/has no design/);
  });
});

describe("a study export's manifest, read before importing", () => {
  const manifest = {
    format: "annotinder-study-export",
    formatVersion: 1,
    client: { release: "0.1.0", commit: "abc1234" },
    exportedAt: "2026-11-20T10:00:00.000Z",
    migration: { idx: 1, tag: "0001_seed" },
    study: { name: "Framing" },
    tables: [
      { name: "studies", rows: 1 },
      { name: "design_versions", rows: 2 },
      { name: "units", rows: 20 },
      { name: "coders", rows: 3 },
      { name: "annotation_values", rows: 30 },
    ],
  };
  const exportFile = (m: object, rows: string[] = ['{"table":"studies","row":{}}']) =>
    gzipSync(strToU8([JSON.stringify(m), ...rows].join("\n")));

  it("says what the study holds", () => {
    expect(readExportSummary(exportFile(manifest))).toMatchObject({
      name: "Framing",
      release: "0.1.0",
      units: 20,
      coders: 3,
      answers: 30,
      designVersions: 2,
    });
  });

  it("says what is wrong with other files", () => {
    expect(() => readExportSummary(strToU8("plain text"))).toThrow(/can't be unpacked/);
    expect(() => readExportSummary(exportFile({ hello: 1 }))).toThrow(/isn't a study export/);
    expect(() =>
      readExportSummary(exportFile({ ...manifest, formatVersion: 9, client: { release: "9.0.0", commit: "x" } })),
    ).toThrow(/newer AnnoTinder \(9.0.0\)/);
  });
});
