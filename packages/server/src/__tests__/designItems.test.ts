import { describe, expect, it } from "vitest";
import type { DesignItem } from "@annotinder/contracts";
import { findEndItem } from "../runtime/designItems.js";

describe("findEndItem", () => {
  it("finds end items in a branch's else items too", () => {
    const items = [
      {
        type: "branch",
        condition: { script: "$var.age.gte(18)" },
        children: [{ type: "end", name: "adult", outcome: "complete" }],
        elseChildren: [{ type: "end", name: "minor", outcome: "screenout" }],
      },
    ] as DesignItem[];
    expect(findEndItem(items, "adult")?.outcome).toBe("complete");
    expect(findEndItem(items, "minor")?.outcome).toBe("screenout");
    expect(findEndItem(items, "nope")).toBeNull();
  });
});
