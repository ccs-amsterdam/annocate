import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { insertableTypesAt } from "./utils";

const session = { type: "session", _key: "S" };
const question = (key: string) => ({
  type: "question",
  _key: key,
  name: key,
  variable: { type: "confirm", question: "?" },
});
const branch = (key: string, ...children: object[]) => ({
  type: "branch",
  _key: key,
  condition: { script: "true" },
  children,
});
const loop = (key: string) => ({
  type: "unit_loop",
  _key: key,
  children: [question(`${key}_q`)],
});
const items = (...list: object[]) => list as unknown as TopLevelItem[];

describe("the tree's branches", () => {
  const design = items(session, branch("B1", question("a"), question("b")), loop("L1"), branch("B2", question("c")));

  it("offers branches between branches, and items in them", () => {
    // At the top level: anything but an end item (that goes in a branch)
    expect(insertableTypesAt(design, { into: null })).toEqual(["question", "experiment", "branch", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "L1" })).toEqual(["question", "experiment", "branch", "unit_loop"]);
    expect(insertableTypesAt(design, { before: "B1" })).toEqual(["question", "experiment", "branch", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "a" })).toEqual(["question", "experiment", "branch", "end"]);
    expect(insertableTypesAt(design, { into: "B2" })).toEqual(["question", "experiment", "branch", "end"]);
    expect(insertableTypesAt(design, { into: "L1" })).toEqual(["question", "layout", "branch", "end"]);
  });
});
