import { describe, expect, it } from "vitest";
import type { TopLevelItem, InLoopItem, UserVariableItem, UnitVariableItem } from "./item.js";
import { availableQuestions, validateCodebookItems } from "./validation.js";
import { CodebookItemsSchema } from "./codebook.js";
import type { Condition } from "./condition.js";

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
function unitLoop(name: string, children: InLoopItem[], template = "", constants?: Record<string, string>): TopLevelItem {
  return { type: "unit_loop", name, units: [{ sources: [{ unitset: "__all__" }] }], layout: { template, constants }, children };
}
function topCondition(name: string, children: TopLevelItem[], condition: Condition = { script: "true" }): TopLevelItem {
  return { type: "condition", name, condition, children };
}
function inLoopCondition(name: string, children: InLoopItem[], condition: Condition = { script: "true" }): InLoopItem {
  return { type: "condition", name, condition, children };
}
const select = (codes: string[], extra: object = {}) => ({
  type: "select_code",
  question: "?",
  codes: codes.map((code, i) => ({ code, value: i })),
  ...extra,
});
const messages = (items: unknown[]) => validateCodebookItems(items).map((i) => i.message);

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
        {
          when: { rules: [{ ref: "$var.slot.code", op: "is", value: ["1", "2"] }] },
          sources: [{ unitset: "part_$var.slot.code" }, { unitset: "overlap" }],
        },
        {
          sources: [
            { unitset: "pool", dynamic: { minCoders: 2, maxCoders: 4, agreement: { variable: "q1", minAgree: 2 } } },
          ],
        },
      ]),
    ];
    expect(validateCodebookItems(valid)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(valid)).not.toThrow();

    const when = (value: string) => ({ rules: [{ ref: "$var.slot.code", op: "is", value }] });
    // variable defined after the loop
    expect(messages([loop([{ when: when("1"), sources: [{ unitset: "a" }] }]), slot])).toEqual([
      "$var.slot.code: 'slot' is asked after this point",
    ]);
    expect(messages([slot, loop([{ when: when("3"), sources: [{ unitset: "a" }] }])])).toEqual([
      "'3' is not a code of 'slot'",
    ]);
    expect(messages([slot, loop([{ sources: [{ unitset: "part_$var.group.code" }] }])])).toEqual([
      "$var.group.code: 'group' is not a question",
    ]);
    // a question of the loop itself, or $unit, can't route
    expect(
      messages([slot, loop([{ when: { rules: [{ ref: "$var.q1.answered", op: "is", value: true }] }, sources: [{ unitset: "a" }] }])]),
    ).toEqual(["$var.q1.answered: branches and unitset names can only use coder-level questions from before the loop"]);
    expect(messages([slot, loop([{ when: { script: "$unit.x > 1" }, sources: [{ unitset: "a" }] }])])).toEqual([
      "$unit.x: branches and unitset names can only use coder-level $var references",
    ]);
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
      ], "$unit.text::tokenize"),
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

describe("reference validation", () => {
  const role = questionVar("role", select(["student", "researcher"]));
  const topics = questionVar("topics", select(["a", "b"], { multiple: true }));
  const interest = questionVar("interest", { type: "scale", question: "?", codes: [{ code: "low", value: 1 }, { code: "high", value: 5 }], items: [{ name: "tech" }] });

  it("accepts references to earlier questions, in rules, scripts and texts", () => {
    const items = [
      role,
      topics,
      interest,
      topCondition("c1", [questionVar("why", { ...confirmVariable, question: "You are a $var.role.code. Topics: {{ $var.topics.code.join(' ') }}" })], {
        match: "any",
        rules: [
          { ref: "$var.role.code", op: "is", value: "student" },
          { ref: "$var.topics.code", op: "is", value: ["a", "b"] },
          { ref: "$var.interest.tech.value", op: "gte", value: 4 },
        ],
      }),
      unitLoop(
        "loop",
        [
          questionVar("rel", select(["yes", "no"], { question: "Is $const.subject in **$unit.headline**?" })),
          inLoopCondition("c2", [questionVar("q2")], { script: "$var.rel.code === 'yes' && $var.why.answered && $unit.n > 3" }),
          questionVar("q3", { ...confirmVariable, question: "{{ $var.q2.answered ? 'again' : '' }}" }),
        ],
        "# $unit.headline\n\n$const.subject::markdown\n\n{{ $var.role.code }}",
        { subject: "politics" },
      ),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
  });

  it("rejects forward references, self references and refs into a condition's own children", () => {
    expect(messages([topCondition("c", [questionVar("q")], { script: "$var.later.answered" }), role, questionVar("later")])).toEqual([
      "$var.later.answered: 'later' is asked after this point",
    ]);
    expect(messages([questionVar("q", { ...confirmVariable, question: "{{ $var.q.answered }}" })])).toEqual([
      "$var.q.answered: a question can't refer to itself",
    ]);
    expect(messages([topCondition("c", [questionVar("inner")], { rules: [{ ref: "$var.inner.answered", op: "is", value: true }] })])).toEqual([
      "$var.inner.answered: 'inner' is inside this condition",
    ]);
  });

  it("rejects refs into another loop, and $unit/$const outside a loop", () => {
    const items = [
      unitLoop("a", [questionVar("qa")]),
      unitLoop("b", [inLoopCondition("c", [questionVar("qb")], { script: "$var.qa.answered" })]),
      questionVar("after", { ...confirmVariable, question: "$unit.headline and $const.x" }),
    ];
    expect(messages(items)).toEqual([
      "$var.qa.answered: 'qa' is a question of unit loop 'a'",
      "$unit.headline can only be used inside a unit loop",
      "$const.x can only be used inside a unit loop",
    ]);
    expect(messages([unitLoop("l", [questionVar("q")], "$const.nope")])).toEqual([
      "$const.nope: 'nope' is not a constant of this loop's layout",
    ]);
  });

  it("checks that the property fits the question type", () => {
    const check = (ref: string) => messages([role, topics, interest, questionVar("c", confirmVariable), topCondition("x", [questionVar("q")], { script: ref })]);
    expect(check("$var.role.text")).toEqual(["$var.role.text: .text is only available for span questions"]);
    expect(check("$var.interest.code")).toEqual(["$var.interest.code: 'interest' has items; use $var.interest.<item>.code"]);
    expect(check("$var.interest.food.code")).toEqual(["$var.interest.food.code: 'food' is not an item of 'interest'"]);
    expect(check("$var.c.code")).toEqual(["$var.c.code: 'c' is a confirm question; only .answered is available"]);
    expect(check("$var.role")).toEqual(["$var.role needs a property: .code, .value, .text or .answered"]);
    expect(check("$var[name].code")).toEqual(["Names after $var must be literal ($var.name), not computed ($var[...])"]);
    expect(check("Object.keys($var)")).toEqual(["$var must be followed by a name ($var.name)"]);
    // .value on codes without values is a warning, not an error
    const noValues = questionVar("nv", { type: "select_code", question: "?", codes: [{ code: "a" }] });
    const issues = validateCodebookItems([noValues, topCondition("x", [questionVar("q")], { script: "$var.nv.value > 1" })]);
    expect(issues).toEqual([expect.objectContaining({ warning: true })]);
    expect(() => CodebookItemsSchema.parse([noValues, topCondition("x", [questionVar("q")], { script: "$var.nv.value > 1" })])).not.toThrow();
  });

  it("checks that rule ops and values fit the reference", () => {
    const rule = (ref: string, op: string, value: unknown) =>
      messages([role, topics, topCondition("x", [questionVar("q")], { rules: [{ ref, op, value }] } as Condition)]);
    expect(rule("$var.topics.code", "gt", 1)).toEqual(["$var.topics.code holds a list; 'gt' needs a single number"]);
    expect(rule("$var.role.code", "gt", 1)).toEqual(["'gt' needs a numeric reference (.value, or a numeric unit field), not $var.role.code"]);
    expect(rule("$var.role.value", "gt", "1")).toEqual(["'gt' needs a number"]);
    expect(rule("$var.role.code", "is", ["student", "prof"])).toEqual(["'prof' is not a code of 'role'"]);
    expect(rule("role", "is", "student")).toEqual(["'role' is not a reference ($unit.x, $var.q.code, $const.y)"]);
  });

  it("only allows ::tokenize on a bare $unit/$const in the layout, and requires it for span columns", () => {
    const span = questionVar("s", { type: "span", question: "?", column: "text", codes: [{ code: "x" }] });
    expect(messages([unitLoop("l", [span], "{{ $unit.text }}::tokenize")])).toEqual([
      "::tokenize only works on a bare $unit.<field> or $const.<name>",
      "Span question 's' selects text in 'text', but the layout doesn't show it as $unit.text::tokenize",
    ]);
    expect(messages([unitLoop("l", [questionVar("q", { ...confirmVariable, question: "$unit.text::tokenize" })], "$unit.text")])).toEqual([
      "::tokenize can only be used in the unit layout",
    ]);
    expect(messages([unitLoop("l", [span], "$const.text::tokenize", { text: "a b c" })])).toEqual([]);
  });

  it("reserves reference properties as item names", () => {
    const bad = questionVar("s", { type: "scale", question: "?", codes: [{ code: "a" }], items: [{ name: "code" }] });
    expect(() => CodebookItemsSchema.parse([bad])).toThrow(/Item names can't be/);
  });
});

describe("availableQuestions", () => {
  it("lists earlier questions, in a loop including its earlier questions", () => {
    const items = [
      questionVar("a"),
      unitLoop("l", [questionVar("b"), inLoopCondition("c", [questionVar("d")]), questionVar("e")]),
      unitLoop("m", [questionVar("f")]),
    ];
    const names = (at: (string | number)[]) => availableQuestions(items, at).map((q) => q.name);
    expect(names([1])).toEqual(["a"]);
    expect(names([1, "children", 1])).toEqual(["a", "b"]);
    expect(names([1, "children", 2])).toEqual(["a", "b", "d"]);
    expect(names([2, "children", 0])).toEqual(["a"]);
  });
});
