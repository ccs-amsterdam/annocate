import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { diffCodebooks, summarizeChanges, valueChanges } from "./diff";

const question = (name: string, question = "?") =>
  ({ type: "question", name, variable: { type: "confirm", question } }) as TopLevelItem;
const loop = (name: string, children: unknown[]) =>
  ({
    type: "unit_loop",
    label: name,
    units: [{ mode: "all", unitset: "main" }],
    layout: { template: "text" },
    children,
  }) as TopLevelItem;

describe("diffCodebooks", () => {
  it("finds no changes in identical codebooks", () => {
    const items = [question("a"), loop("l", [question("b")])];
    expect(diffCodebooks(items, items)).toEqual([]);
  });

  it("reports added, removed, changed and moved items", () => {
    const before = [question("a"), question("gone"), loop("l", [question("b"), question("c")])];
    const after = [question("a", "new wording"), question("c"), loop("l", [question("b"), question("new")])];
    expect(diffCodebooks(before, after)).toEqual([
      { kind: "removed", name: "gone", type: "question", parent: null },
      { kind: "changed", name: "a", type: "question", parent: null },
      { kind: "moved", name: "c", type: "question", parent: null },
      { kind: "added", name: "new", type: "question", parent: "l" },
    ]);
  });

  it("doesn't report a container as changed when only its children changed", () => {
    const before = [loop("l", [question("b")])];
    const after = [loop("l", [question("b", "other")])];
    expect(diffCodebooks(before, after)).toEqual([{ kind: "changed", name: "b", type: "question", parent: "l" }]);
  });
});

describe("summarizeChanges", () => {
  it("groups changes by kind", () => {
    expect(
      summarizeChanges([
        { kind: "removed", name: "x", type: "question", parent: null },
        { kind: "changed", name: "a", type: "question", parent: null },
        { kind: "changed", name: "b", type: "question", parent: null },
      ]),
    ).toBe("Changed a, b; removed x");
  });

  it("is empty without changes", () => {
    expect(summarizeChanges([])).toBe("");
  });
});

describe("valueChanges", () => {
  const q = (variable: object) => [{ type: "question", name: "q", variable }] as unknown as TopLevelItem[];
  it("warns when values disappear or the level changes", () => {
    const before = q({ type: "nominal", question: "?", options: [{ value: "a" }, { value: "b" }] });
    expect(valueChanges(before, q({ type: "nominal", question: "?", options: [{ value: "a", label: "A!" }, { value: "b" }] }))).toEqual([]);
    expect(valueChanges(before, q({ type: "nominal", question: "?", options: [{ value: "a" }] }))).toEqual([
      `'q' no longer has the value "b": earlier answers with it no longer fit.`,
    ]);
    expect(valueChanges(before, q({ type: "ordinal", question: "?", options: [{ value: 1 }] }))).toEqual([
      `'q' changed from nominal to ordinal: earlier answers no longer fit.`,
    ]);
  });
});
