import { describe, expect, it } from "vitest";
import { RELEASE, designFile, DesignFileSchema } from "./version.js";

describe("release and design files", () => {
  it("a design file holds the design with its format and client", () => {
    const file = designFile(
      { items: [{ type: "question", name: "q", variable: { type: "confirm", question: "Ok?" } }], session: null, units: { fields: [] }, note: "v1" },
      { name: "Pilot", version: 1, client: { release: RELEASE, commit: "abc1234" } },
    );
    expect(DesignFileSchema.parse(JSON.parse(JSON.stringify(file)))).toMatchObject({ format: "annotinder-design", formatVersion: 1, version: 1 });
  });
});
