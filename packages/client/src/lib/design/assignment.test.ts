import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { coderSummary, columnValues, shareLabel, shareSources, shareSummary } from "./assignment";

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

  it("coders: all emails (one sign-in link), names (a link each), or a mix (an error)", () => {
    expect(coderSummary(["a@uni.nl", "b@uni.nl"])).toEqual({ kind: "emails", count: 2, notEmails: [] });
    expect(coderSummary(["anna", "bob"])).toMatchObject({ kind: "names", count: 2 });
    expect(coderSummary(["anna", "b@uni.nl"])).toEqual({ kind: "mixed", count: 2, notEmails: ["anna"] });
    expect(coderSummary([])).toMatchObject({ kind: "none", count: 0 });
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
    expect(shareLabel("coder_set=anna,condition_set=control | part post | overlap before")).toBe(
      "anna · condition control, only post",
    );
    expect(shareLabel("all")).toBe("all units");
    expect(shareLabel("session 12 as 1")).toBe("each coder's units of the previous loop");
  });
});
