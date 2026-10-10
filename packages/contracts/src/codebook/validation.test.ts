import { describe, expect, it } from "vitest";
import type { TopLevelItem, InLoopItem, UserVariableItem, UnitVariableItem } from "./item.js";
import { validateCodebookItems } from "./validation.js";
import { CodebookItemsSchema } from "./codebook.js";

const confirmVariable = { type: "confirm" as const, question: "Confirm?" };

function userVar(name: string): UserVariableItem {
  return { type: "user_variable", name, variable: confirmVariable };
}
function unitVar(name: string): UnitVariableItem {
  return { type: "unit_variable", name, variable: confirmVariable };
}
function questionVar(name: string, variable: any = confirmVariable): any {
  return { type: "question", name, variable };
}
function unitLoop(name: string, children: InLoopItem[], unitset = "__all__"): TopLevelItem {
  return { type: "unit_loop", name, units: [{ sources: [{ unitset }] }], layout: { template: "" }, children };
}
function topCondition(name: string, children: TopLevelItem[], expression = "true"): TopLevelItem {
  return { type: "condition", name, expression, children };
}
function inLoopCondition(name: string, children: InLoopItem[], expression = "true"): InLoopItem {
  return { type: "condition", name, expression, children };
}

describe("validateCodebookItems", () => {
  it("accepts a minimal valid tree codebook", () => {
    const items: TopLevelItem[] = [unitLoop("loop", [unitVar("q1")])];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("migrates the legacy unitset/randomizeUnits loop shape", () => {
    const legacy = (extra: object) => [
      { type: "unit_loop", name: "loop", layout: { template: "" }, children: [unitVar("q1")], ...extra },
    ];
    expect(validateCodebookItems(legacy({ randomizeUnits: true }))).toEqual([]);
    expect(CodebookItemsSchema.parse(legacy({ randomizeUnits: true }))[0]).toMatchObject({
      units: [{ sources: [{ unitset: "__all__" }] }],
      order: "random",
    });
    expect(CodebookItemsSchema.parse(legacy({ unitset: "" }))[0]).toMatchObject({
      units: [{ sources: [{ unitset: "__all__" }] }],
    });
    const parsed = CodebookItemsSchema.parse(legacy({ unitset: "main" }))[0];
    expect(parsed).toMatchObject({ units: [{ sources: [{ unitset: "main" }] }] });
    expect(parsed).not.toHaveProperty("unitset");
  });

  it("checks that loop branches refer to preceding coder variables", () => {
    const slot = questionVar("slot", { type: "auto", source: "invite", options: [{ code: "1" }, { code: "2" }] });
    const loop = (units: unknown): TopLevelItem =>
      ({ type: "unit_loop", name: "loop", units, layout: { template: "" }, children: [questionVar("q1")] }) as TopLevelItem;

    const valid: TopLevelItem[] = [
      slot,
      loop([
        { when: { slot: ["1", "2"] }, sources: [{ unitset: "part_{slot}" }, { unitset: "overlap" }] },
        {
          sources: [
            { unitset: "pool", dynamic: { minCoders: 2, maxCoders: 4, agreement: { variable: "q1", minAgree: 2 } } },
          ],
        },
      ]),
    ];
    expect(validateCodebookItems(valid)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(valid)).not.toThrow();

    const messages = (items: TopLevelItem[]) => validateCodebookItems(items).map((i) => i.message);
    // variable defined after the loop
    expect(messages([loop([{ when: { slot: "1" }, sources: [{ unitset: "a" }] }]), slot])).toEqual([
      "'slot' is not a coder-level variable defined before this loop",
    ]);
    expect(messages([slot, loop([{ when: { slot: "3" }, sources: [{ unitset: "a" }] }])])).toEqual([
      "'3' is not a code of 'slot'",
    ]);
    expect(messages([slot, loop([{ sources: [{ unitset: "part_{group}" }] }])])[0]).toContain("'{group}'");
    expect(
      messages([slot, loop([{ sources: [{ unitset: "a", dynamic: { maxCoders: 3, agreement: { variable: "nope", minAgree: 2 } } }] }])]),
    ).toEqual(["Agreement variable 'nope' is not a question in this loop"]);
  });

  it("requires maxCoders with an agreement rule", () => {
    const items = [
      {
        type: "unit_loop",
        name: "loop",
        units: [{ sources: [{ unitset: "a", dynamic: { agreement: { variable: "q1", minAgree: 2 } } }] }],
        layout: { template: "" },
        children: [unitVar("q1")],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow(/maxCoders/);
  });

  it("allows user_variable and condition items outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      userVar("consent"),
      topCondition("gate", [userVar("followup")]),
      unitLoop("loop", [unitVar("q1")]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("allows unified 'question' items both inside and outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent", confirmVariable),
      unitLoop("loop", [
        questionVar("sentiment", confirmVariable),
        questionVar("spans", {
          type: "span",
          question: "Highlight spans",
          column: "text",
          codes: [{ code: "tag" }],
        }),
      ]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects span question outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("bad_span", {
        type: "span",
        question: "Bad",
        column: "text",
        codes: [{ code: "tag" }],
      }),
      unitLoop("loop", [questionVar("q1")]),
    ];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("can only be used inside a unit_loop"))).toBe(true);
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("allows condition items nested inside a unit_loop, wrapping unit_variable", () => {
    const items: TopLevelItem[] = [
      unitLoop("loop", [inLoopCondition("gate", [unitVar("q1")])]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects duplicate names across the entire tree", () => {
    const items: TopLevelItem[] = [
      userVar("dup_name"),
      unitLoop("loop", [unitVar("dup_name")]),
    ];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate name 'dup_name'"))).toBe(true);
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects a unit_loop with no children via schema", () => {
    const items = [
      {
        type: "unit_loop",
        name: "empty_loop",
        unitset: "main",
        layout: { template: "" },
        children: [],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects user_variable nested inside a unit_loop via schema", () => {
    const items = [
      {
        type: "unit_loop",
        name: "loop",
        unitset: "main",
        layout: { template: "" },
        children: [{ type: "user_variable", name: "bad", variable: confirmVariable }],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects unit_variable outside a unit_loop via schema", () => {
    const items = [
      { type: "unit_variable", name: "bad", variable: confirmVariable },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects nested unit_loops via schema", () => {
    const items = [
      {
        type: "unit_loop",
        name: "outer",
        unitset: "main",
        layout: { template: "" },
        children: [
          {
            type: "unit_loop",
            name: "inner",
            unitset: "main",
            layout: { template: "" },
            children: [unitVar("q1")],
          },
        ],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("detects empty and invalid names via validateCodebookItems", () => {
    const emptyNameItems: TopLevelItem[] = [userVar("")];
    const emptyIssues = validateCodebookItems(emptyNameItems);
    expect(emptyIssues.some((i) => i.message.includes("cannot be empty"))).toBe(true);

    const invalidNameItems: TopLevelItem[] = [userVar("invalid name with spaces!")];
    const invalidIssues = validateCodebookItems(invalidNameItems);
    expect(invalidIssues.some((i) => i.message.includes("contains invalid characters"))).toBe(true);
  });
});
