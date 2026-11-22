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
const block = (key: string, ...children: object[]) => ({ type: "questions", _key: key, children });
const loop = (key: string) => ({
  type: "unit_loop",
  _key: key,
  layout: { template: "" },
  children: [question(`${key}_q`)],
});
const items = (...list: object[]) => list as unknown as TopLevelItem[];

describe("the tree's blocks", () => {
  const design = items(session, block("B1", question("a"), question("b")), loop("L1"), block("B2", question("c")));

  it("offers blocks between blocks, and items in them", () => {
    expect(insertableTypesAt(design, { into: null })).toEqual(["questions", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "L1" })).toEqual(["questions", "unit_loop"]);
    expect(insertableTypesAt(design, { before: "B1" })).toEqual(["questions", "unit_loop"]);
    expect(insertableTypesAt(design, { after: "a" })).toEqual(["question", "computed", "questions", "end"]);
    expect(insertableTypesAt(design, { into: "B2" })).toEqual(["question", "computed", "questions", "end"]);
    expect(insertableTypesAt(design, { into: "L1" })).toEqual(["question", "questions", "end"]);
  });
});
