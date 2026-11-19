import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { assignmentLinks, coderSummary, columnValues, conditionProblems } from "./assignment";

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

  it("conditions: listed values without units are errors, unlisted column values warnings", () => {
    expect(conditionProblems({ values: ["control", "experiment"], units: "framing" }, groups)).toEqual({
      errors: [],
      warnings: [],
    });
    expect(conditionProblems({ values: ["control", "treatment"], units: "framing" }, groups)).toEqual({
      errors: ['No units for "treatment" in column "framing"'],
      warnings: ['Column "framing" also has "experiment": no session gets those units'],
    });
    expect(conditionProblems({ values: ["a"], units: "missing" }, groups).errors).toEqual([
      'The units have no set column "missing" yet',
    ]);
    expect(conditionProblems({ values: "free", units: "set" }, groups).warnings).toEqual([
      'Column "set" has no values yet',
    ]);
    expect(conditionProblems({ values: ["a"] }, groups)).toEqual({ errors: [], warnings: [] });
  });

  it("links: a link per named coder, times each condition assigned by link", () => {
    const names = coderSummary(["anna", "bob"]);
    expect(assignmentLinks(names, [{ values: ["control", "experiment"], assign: "link" }], groups)).toBe(4);
    expect(
      assignmentLinks(coderSummary(["a@x.nl"]), [{ values: "free", assign: "link", units: "framing" }], groups),
    ).toBe(2);
    expect(assignmentLinks(null, [{ values: ["a", "b"], assign: "random" }], groups)).toBe(1);
  });
});

describe("share summaries", () => {
  it("say whose units a loop hands out, with its filter", async () => {
    const { shareSources, shareSummary, shareLabel, valueCounts } = await import("./assignment");
    const sources = shareSources(
      { coders: { column: "coder" }, conditions: [{ name: "framing", units: "framing" }, { name: "lang" }] },
      [{ name: "set", units: "set" }],
    );
    expect(sources.map((s) => s.label)).toEqual(["coder", "framing", "set"]);
    expect(sources[2].inFlow).toBe(true);
    expect(shareSummary([], undefined)).toBe("A session gets all units, and codes them all.");
    expect(shareSummary(sources.slice(0, 2), { column: "phase", only: ["post"] })).toBe(
      "A session gets the units of its coder × framing; this loop only those with “post” in phase.",
    );
    expect(shareLabel("coder=anna,framing=control | phase only post | overlap")).toBe(
      "anna · framing control, only post",
    );
    expect(shareLabel("all")).toBe("all units");
    const groups = [
      {
        name: "phase",
        sets: [
          { name: "_overlap", unitIds: [9], ordered: false },
          { name: "pre", unitIds: [1, 2], ordered: false },
        ],
      },
    ];
    expect(valueCounts(groups, "phase")).toEqual([
      { value: "pre", count: 2, special: false },
      { value: "_overlap", count: 1, special: true },
    ]);
  });
});
