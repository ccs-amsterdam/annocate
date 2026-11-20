import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { EMPTY_SESSION, RecipeSchema, designFile } from "@annotinder/contracts";
import { readDesignFile } from "./designImport";

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
