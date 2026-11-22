import { describe, expect, it } from "vitest";
import type { CoderUnitLoopItem, TopLevelItem } from "@annotinder/contracts";
import { findEnd, loopVariables } from "./items";

const confirm = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });

describe("codebook lookups", () => {
  it("find end items and loop questions in a block's else items too", () => {
    const items = [
      {
        type: "block",
        condition: { script: "true" },
        children: [{ type: "end", name: "done", outcome: "complete" }],
        elseChildren: [{ type: "end", name: "out", outcome: "screenout" }],
      },
    ] as TopLevelItem[];
    expect(findEnd(items, "done")?.outcome).toBe("complete");
    expect(findEnd(items, "out")?.outcome).toBe("screenout");
    expect(findEnd(items, "nope")).toBeNull();

    const loop = {
      type: "unit_loop",
      children: [
        confirm("a"),
        { type: "block", condition: { script: "true" }, children: [confirm("b")], elseChildren: [confirm("c")] },
      ],
    } as unknown as CoderUnitLoopItem;
    expect([...loopVariables(loop).keys()]).toEqual(["a", "b", "c"]);
  });
});
