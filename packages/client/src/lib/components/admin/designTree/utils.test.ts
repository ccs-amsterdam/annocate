import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { insertableTypesAt, topBlocks } from "./utils";

const session = { type: "session", _key: "S" };
const question = (key: string) => ({
  type: "question",
  _key: key,
  name: key,
  variable: { type: "confirm", question: "?" },
});
const loop = (key: string) => ({
  type: "unit_loop",
  _key: key,
  layout: { template: "" },
  children: [question(`${key}_q`)],
});
const items = (...list: object[]) => list as unknown as TopLevelItem[];

describe("the tree's blocks", () => {
  const design = items(session, question("a"), question("b"), loop("L1"), loop("L2"), question("c"));

  it("groups the items between unit loops in Questions blocks", () => {
    expect(
      topBlocks(design).map((b) =>
        b.kind === "loop"
          ? (b.item as unknown as { _key: string })._key
          : b.items.map((i) => (i as unknown as { _key: string })._key),
      ),
    ).toEqual([["a", "b"], "L1", "L2", ["c"]]);
  });

  it("offers blocks between blocks, and items in them", () => {
    expect(insertableTypesAt(design, { into: null })).toEqual(["questions", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "L1" })).toEqual(["questions", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "a" })).toEqual(["question", "computed", "show_if", "end"]);
    expect(insertableTypesAt(design, { into: "L1" })).toEqual(["question", "show_if", "end"]);
  });
});
