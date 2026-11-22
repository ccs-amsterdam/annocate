import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { coderSummary, columnValues } from "./assignment";

const group = (name: string, sets: string[]): SetGroupResponse =>
  ({ name, sets: sets.map((s) => ({ name: s, unitIds: [], ordered: false })) }) as SetGroupResponse;
const groups = [
  group("coder", ["anna", "bob", "_overlap"]),
  group("framing", ["control", "experiment", "_gold"]),
  group("set", []),
];

describe("who gets which units, in the editor", () => {
  it("a column's values leave out the special sets", () => {
    expect(columnValues(groups, "coder")).toEqual(["anna", "bob"]);
    expect(columnValues(groups, "nope")).toEqual([]);
  });

  it("coders: all emails (one sign-in link), names (a link each), or a mix (an error)", () => {
    expect(coderSummary(["a@uni.nl", "b@uni.nl"])).toEqual({ kind: "emails", count: 2, notEmails: [] });
    expect(coderSummary(["anna", "bob"])).toMatchObject({ kind: "names", count: 2 });
    expect(coderSummary(["anna", "b@uni.nl"])).toEqual({ kind: "mixed", count: 2, notEmails: ["anna"] });
    expect(coderSummary([])).toMatchObject({ kind: "none", count: 0 });
  });
});

describe("share summaries", () => {
  it("say whose units a loop hands out, with its filter", async () => {
    const { shareSources, shareSummary, shareLabel } = await import("./assignment");
    const sources = shareSources({ mode: "coders", column: "coder", link: "per_coder" }, [
      { name: "framing", units: "framing" },
      { name: "lang" },
    ]);
    expect(sources.map((s) => s.label)).toEqual(["coder", "framing"]);
    expect(sources[1].inFlow).toBe(true);
    expect(shareSources({ mode: "crowd" })).toEqual([]);
    expect(shareSummary([], undefined)).toBe("A session gets all units.");
    expect(shareSummary(sources.slice(0, 2), { column: "phase", sets: ["post"] })).toBe(
      "A session gets the units of its coder × framing; this loop only those in “post” of phase.",
    );
    expect(shareLabel("coder=anna,framing=control | phase post | overlap before")).toBe(
      "anna · framing control, only post",
    );
    expect(shareLabel("all")).toBe("all units");
  });
});
