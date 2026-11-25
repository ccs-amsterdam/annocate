import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { columnValues, shareSources, shareSummary } from "./assignment";

const group = (name: SetGroupResponse["name"], sets: string[]): SetGroupResponse => ({
  name,
  sets: sets.map((s) => ({ name: s, unitIds: [], ordered: false })),
});
const groups = [group("coder_set", ["anna", "bob"]), group("condition_set", ["control", "experiment"])];

describe("who gets which units, in the editor", () => {
  it("a column's values", () => {
    expect(columnValues(groups, "coder_set")).toEqual(["anna", "bob"]);
    expect(columnValues(groups, "part_set")).toEqual([]);
  });
});

describe("share summaries", () => {
  it("say whose units a loop hands out, with its part", () => {
    const sources = shareSources({ mode: "coders", link: "per_coder" }, [
      { name: "framing", selectsUnits: true },
      { name: "lang" },
    ]);
    expect(sources.map((s) => s.label)).toEqual(["coder", "framing"]);
    expect(sources[1]).toMatchObject({ column: "condition_set", inFlow: true });
    expect(shareSources({ mode: "crowd" })).toEqual([]);
    expect(shareSummary([], undefined)).toBe("A session gets all units.");
    expect(shareSummary(sources, "post")).toBe(
      "A session gets the units of its coder × framing; this loop only those of part “post”.",
    );
  });
});
