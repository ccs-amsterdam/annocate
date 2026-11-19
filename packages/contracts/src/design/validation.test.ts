import { describe, expect, it } from "vitest";
import { TopLevelItemSchema, type TopLevelItem, type InLoopItem, type TopLevelQuestionItem, type InLoopQuestionItem } from "./item.js";
import { availableQuestions, validateDesignItems } from "./validation.js";
import { DesignItemsSchema } from "./designVersion.js";
import type { Condition } from "./condition.js";

const confirmVariable = { type: "confirm" as const, question: "Confirm?" };

/** A question usable at the top level and in loops; `variable` is unchecked test data. */
function questionVar(name: string, variable: object = confirmVariable): TopLevelQuestionItem & InLoopQuestionItem {
  return { type: "question", name, variable } as TopLevelQuestionItem & InLoopQuestionItem;
}
function unitLoop(name: string, children: InLoopItem[], template = "", snippets?: Record<string, string>): TopLevelItem {
  return { type: "unit_loop", label: name, layout: { template, snippets }, children };
}
function topCondition(name: string, children: TopLevelItem[], condition: Condition = { script: "true" }): TopLevelItem {
  return { type: "show_if", label: name, condition, children };
}
function inLoopCondition(name: string, children: InLoopItem[], condition: Condition = { script: "true" }): InLoopItem {
  return { type: "show_if", label: name, condition, children };
}
const select = (values: string[], extra: object = {}) => ({
  type: "nominal",
  question: "?",
  options: values.map((value) => ({ value })),
  ...extra,
});
const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);

describe("validateDesignItems", () => {
  it("accepts a minimal valid tree codebook", () => {
    const items: TopLevelItem[] = [unitLoop("loop", [questionVar("q1")])];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("saves questions without an answer type, but reports them", () => {
    const items = [questionVar("age", { type: "unspecified" }), unitLoop("loop", [questionVar("topic", { type: "unspecified" })])];
    // A valid shape (a draft can be saved); not publishable
    expect(TopLevelItemSchema.array().safeParse(items).success).toBe(true);
    expect(DesignItemsSchema.safeParse(items).success).toBe(false);
    expect(messages(items)).toEqual(["Question 'age' has no answer type yet: choose one", "Question 'topic' has no answer type yet: choose one"]);
  });

  it("checks a loop's agreement question", () => {
    const loop = (units: unknown): TopLevelItem =>
      ({ type: "unit_loop", label: "loop", units, layout: { template: "" }, children: [questionVar("q1", select(["a", "b"])), questionVar("c1")] }) as TopLevelItem;
    const valid = [loop({ filter: { column: "phase", only: ["post"] }, criteria: { until: { agree: 2, on: "q1" }, codersPerUnit: { max: 4 } }, overlap: { placement: "first" } })];
    expect(validateDesignItems(valid)).toEqual([]);
    expect(() => DesignItemsSchema.parse(valid)).not.toThrow();
    expect(messages([loop({ criteria: { until: { agree: 2, on: "nope" }, codersPerUnit: { max: 3 } } })])).toEqual([
      "Agreement question 'nope' is not a question in this loop",
    ]);
    expect(messages([loop({ criteria: { until: { agree: 2, on: "c1" }, codersPerUnit: { max: 3 } } })])).toEqual([
      `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "c1" is a confirm question`,
    ]);
    // Branches are gone: a list of settings is not a loop's units
    expect(DesignItemsSchema.safeParse([loop([{}])]).success).toBe(false);
  });

  it("requires the most coders per unit with an agreement rule", () => {
    const items = [{ type: "unit_loop", label: "loop", units: { criteria: { until: { agree: 2, on: "q1" } } }, layout: { template: "" }, children: [questionVar("q1")] }];
    expect(() => DesignItemsSchema.parse(items)).toThrow(/most coders per unit when coding until coders agree/);
  });

  it("checks a loop's filter and criteria", () => {
    const loop = (units: object) => [
      { type: "unit_loop", label: "loop", units, layout: { template: "" }, children: [questionVar("q1", select(["a", "b"]))] },
    ];
    expect(messages(loop({}))).toEqual([]);
    expect(messages(loop({ criteria: { codersPerUnit: { min: 3, max: 2 } } }))).toEqual([
      "The most coders per unit must be at least the coders (or agreeing coders) a unit needs",
    ]);
    expect(messages(loop({ criteria: { unitsPerCoder: { min: 5, max: 2 } } }))).toEqual(["The minimum units per coder can't be more than the maximum"]);
    expect(messages(loop({ criteria: {}, overlap: { placement: "spread" } }))).toEqual([
      "Spreading special units in a shared queue needs a maximum of units per coder (to know where to put them)",
    ]);
    expect(messages(loop({ criteria: { unitsPerCoder: { max: 10 } }, overlap: { placement: "spread" } }))).toEqual([]);
    // Without criteria a coder's units are known: spreading works
    expect(messages(loop({ overlap: { placement: "spread" } }))).toEqual([]);
    expect(messages(loop({ overlap: { placement: "last", expect: 20, max: 10 } }))).toEqual(["At most 10 overlap units, but the design expects 20"]);
    expect(messages(loop({ filter: { column: "phase" } }))).toEqual(["A filter has either only or except values"]);
    expect(messages(loop({ filter: { column: "phase", only: ["a"], except: ["b"] } }))).toEqual(["A filter has either only or except values"]);
    expect(messages(loop({ filter: { column: "_phase", except: ["_overlap"] } }))).toEqual([expect.stringMatching(/group's name/)]);
    expect(messages(loop({ mode: "all" }))).toEqual([]); // unknown keys are dropped
  });

  it("checks computed items: outside loops, linked to a set column, a column each", () => {
    const random = (extra: object, name = "set") => ({ type: "computed", name, variable: { type: "random", draw: "balanced", ...extra } });
    const loop = unitLoop("loop", [questionVar("q1")]);
    expect(messages([random({ units: "set" }), loop])).toEqual([]);
    expect(messages([random({ options: [{ value: "a" }] }), loop])).toEqual([]);
    expect(messages([random({})])).toEqual(["List the values, or link the variable to a set column of the units"]);
    // Usable as $var.<name> after it
    const after = topCondition("c", [loop], { script: `$var.set.is("a")` });
    expect(messages([random({ options: [{ value: "a" }, { value: "b" }] }), after])).toEqual([]);
    expect(messages([after, random({ options: [{ value: "a" }] })])).toEqual(["$var.set.is: 'set' is asked after this point"]);
    // Not in a loop
    expect(messages([unitLoop("loop", [questionVar("q1"), random({ options: [{ value: "a" }] }, "inner") as unknown as InLoopItem])])).toContain(
      "Computed item 'inner' can only be used outside a unit loop",
    );
    // A loop before it doesn't use it: a warning
    expect(validateDesignItems([loop, random({ units: "set" })])).toEqual([
      expect.objectContaining({ warning: true, message: expect.stringContaining("comes before computed item 'set'") }),
    ]);
    const session = { type: "session", params: [], coders: { column: "set" } };
    expect(messages([session, random({ units: "set" })])).toEqual(["Column 'set' already selects units for the coders: use a column each"]);
    const named = { type: "session", params: [], conditions: [{ name: "set", values: ["a"], assign: "link" }] };
    expect(messages([named, random({ units: "other" })])).toEqual(["Computed item 'set' selects units: its name can't also be a session value"]);
    // One value per column: drawn independently, two would rarely leave a session any units
    const assigned = { type: "session", params: [], conditions: [{ name: "framing", values: "free", assign: "random", units: "set" }] };
    expect(messages([assigned, random({ units: "set" })])).toEqual(["Column 'set' already selects units for condition 'framing': use a column each"]);
    expect(messages([random({ units: "set" }), random({ units: "set" }, "other")])).toEqual(["Column 'set' already selects units for computed item 'set': use a column each"]);
  });
});

describe("the Session item", () => {
  const session = (extra: object) => ({ type: "session", params: [], ...extra });
  const q = questionVar("q1");

  it("declares $session names; others are refused", () => {
    const text = { type: "question", name: "q", variable: { type: "confirm", question: "Hi $session.group, $session.participant, $session.source, $session.email" } };
    const params = [{ name: "group", kind: "link", values: { list: [{ value: "a" }, { value: "b" }] } }];
    expect(messages([session({ params }), text])).toEqual([]);
    expect(messages([text])).toEqual(["$session.group: no session parameter 'group' (declare it in the Session item)"]);
  });

  it("comes first, once; its parameters are named once, not built in, and link parameters list their values", () => {
    expect(messages([q, session({})])).toEqual(["The Session item comes first in the design, at the top"]);
    expect(messages([session({}), session({})])).toEqual(expect.arrayContaining(["A design has one Session item"]));
    const dup = [
      { name: "a", kind: "url", values: { open: {} } },
      { name: "a", kind: "url", param: "b", values: { open: {} } },
    ];
    expect(messages([session({ params: dup })])).toEqual(["Two session parameters are named 'a'"]);
    expect(messages([session({ params: [{ name: "source", kind: "url", values: { open: {} } }] })])).toContain(
      "participant, source, email and coder are built in: choose another name",
    );
    expect(messages([session({ params: [{ name: "x", kind: "link", values: { open: {} } }] })])).toEqual([
      "A link parameter needs a list of values: links are made for each",
    ]);
    expect(messages([session({ params: [{ name: "x", kind: "url", values: { list: [{ value: "a" }] }, default: "b" }] })])).toEqual([
      "The default 'b' is not one of the values",
    ]);
  });

  it("checks listed combinations against the link parameters", () => {
    const params = [
      { name: "cond", kind: "link", values: { list: [{ value: "a" }, { value: "b" }] } },
      { name: "set", kind: "link", values: { list: [{ value: "s1" }] } },
    ];
    expect(messages([session({ params, combinations: [{ cond: "a", set: "s1" }] })])).toEqual([]);
    expect(messages([session({ params, combinations: [{ cond: "c" }] })])).toEqual([
      "Combination 1 has no value for set",
      "Combination 1: 'c' is not a value of cond",
    ]);
  });
});

describe("coders and assigned conditions", () => {
  const session = (extra: object) => ({ type: "session", params: [], ...extra });

  it("are session values, named once, each by its own column", () => {
    const conditions = [
      { name: "framing", values: ["control", "experiment"], assign: "link", units: "framing" },
      { name: "set", values: "free", assign: "random", units: "set" },
    ];
    const text = { type: "question", name: "q", variable: { type: "confirm", question: "$session.coder $session.framing $session.set" } };
    expect(messages([session({ coders: { column: "coder" }, conditions }), text])).toEqual([]);
    expect(messages([session({ conditions: [...conditions, { name: "framing", values: ["a"], assign: "link" }] })])).toEqual(["Two session values are named 'framing'"]);
    expect(messages([session({ coders: { column: "framing" }, conditions })])).toEqual(["Column 'framing' already selects units for another session value: use a column each"]);
    expect(messages([session({ conditions: [{ name: "coder", values: ["a"], assign: "link" }] })])).toEqual([
      "participant, source, email and coder are built in: choose another name",
    ]);
    expect(messages([session({ conditions: [{ name: "x", values: "free", assign: "link" }] })])).toEqual(["Free values come from a set column: link the condition to one"]);
    expect(messages([session({ conditions: [{ name: "x", values: ["a"], assign: "link", draw: "random" }] })])).toEqual(["Only a random assignment draws"]);
    expect(messages([session({ conditions: [{ name: "x", values: ["a", "_b"], assign: "link" }] })])).toEqual([
      "A value has no ; or #, no spaces at its ends, and doesn't start with _",
    ]);
  });
});

describe("validateDesignItems (more)", () => {
  it("allows questions and condition items outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent"),
      topCondition("gate", [questionVar("followup")]),
      unitLoop("loop", [questionVar("q1")]),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("allows questions both inside and outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent", confirmVariable),
      unitLoop("loop", [
        questionVar("sentiment", confirmVariable),
        questionVar("spans", {
          type: "span",
          question: "Highlight spans",
          fields: ["text"],
          options: [{ value: "tag" }],
        }),
      ], "$unit.text"),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects span question outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("bad_span", {
        type: "span",
        question: "Bad",
        fields: ["text"],
        options: [{ value: "tag" }],
      }),
      unitLoop("loop", [questionVar("q1")]),
    ];
    const issues = validateDesignItems(items);
    expect(issues.some((i) => i.message.includes("can only be used inside a unit_loop"))).toBe(true);
    expect(() => DesignItemsSchema.parse(items)).toThrow();
  });

  it("allows condition items nested inside a unit_loop", () => {
    const items: TopLevelItem[] = [
      unitLoop("loop", [inLoopCondition("gate", [questionVar("q1")])]),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects duplicate names across the entire tree", () => {
    const items: TopLevelItem[] = [
      questionVar("dup_name"),
      unitLoop("loop", [questionVar("dup_name")]),
    ];
    const issues = validateDesignItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate name 'dup_name'"))).toBe(true);
    expect(() => DesignItemsSchema.parse(items)).toThrow();
  });

  it("rejects a unit_loop with no children via schema", () => {
    const items = [
      {
        type: "unit_loop",
        label: "empty_loop",
        layout: { template: "" },
        children: [],
      },
    ];
    expect(() => DesignItemsSchema.parse(items)).toThrow();
  });

  it("rejects nested unit_loops via schema", () => {
    const items = [
      {
        type: "unit_loop",
        label: "outer",
        layout: { template: "" },
        children: [
          {
            type: "unit_loop",
            label: "inner",
                layout: { template: "" },
            children: [questionVar("q1")],
          },
        ],
      },
    ];
    expect(() => DesignItemsSchema.parse(items)).toThrow();
  });

  it("detects empty and invalid names via validateDesignItems", () => {
    const emptyNameItems: TopLevelItem[] = [questionVar("")];
    const emptyIssues = validateDesignItems(emptyNameItems);
    expect(emptyIssues.some((i) => i.message.includes("cannot be empty"))).toBe(true);

    const invalidNameItems: TopLevelItem[] = [questionVar("invalid name with spaces!")];
    const invalidIssues = validateDesignItems(invalidNameItems);
    expect(invalidIssues.some((i) => i.message.includes("contains invalid characters"))).toBe(true);
  });
});

describe("reference validation", () => {
  const role = questionVar("role", select(["student", "researcher"]));
  const topics = questionVar("topics", select(["a", "b"], { multiple: true }));
  const edu = questionVar("edu", { type: "ordinal", question: "?", options: [{ value: 1 }, { value: 2 }, { value: 3 }] });
  const age = questionVar("age", { type: "numeric", question: "?", min: 0, max: 120 });
  const interest = questionVar("interest", { type: "scale", question: "?", options: [{ value: 1 }, { value: 5 }], items: [{ name: "tech" }] });

  it("accepts references to earlier questions, in conditions, scripts and texts", () => {
    const items = [
      role,
      topics,
      interest,
      topCondition("c1", [questionVar("why", { ...confirmVariable, question: "You are a $var.role.label. Topics: {{ $var.topics.labels.join(' ') }}" })], {
        script: `$var.role.is("student") || $var.topics.hasAny("a", "b") || $var.interest.items.tech.gte(5)`,
      }),
      unitLoop(
        "loop",
        [
          questionVar("rel", select(["yes", "no"], { question: "Is [[subject]] in **$unit.headline**?" })),
          inLoopCondition("c2", [questionVar("q2")], { script: "$var.rel.value === 'yes' && $var.why.answered && $unit.n > 3" }),
          questionVar("q3", { ...confirmVariable, question: "{{ $var.q2.answered ? 'again' : '' }}" }),
        ],
        "# $unit.headline\n\n[[subject]]\n\n{{ $var.role.value }}",
        { subject: "politics" },
      ),
    ];
    expect(validateDesignItems(items)).toEqual([]);
  });

  it("rejects unknown $names in scripts, once, but not $ in text", () => {
    expect(messages([age, questionVar("q", { ...confirmVariable, question: "Costs $5. {{ $sesion.x + $var.age.foo }}" })])).toEqual([
      "$sesion is unknown: values are $var, $unit and $session",
      "$var.age.foo: unknown property; use .value, .label, .values, .labels, .texts, .answered, .items or a method",
    ]);
    expect(messages([topCondition("c", [questionVar("q")], { script: "$vars.age > 1 && '$x' !== ''" })])).toEqual([
      "$vars is unknown: values are $var, $unit and $session",
    ]);
  });

  it("rejects forward references, self references and refs into a condition's own children", () => {
    expect(messages([topCondition("c", [questionVar("q")], { script: "$var.later.answered" }), role, questionVar("later")])).toEqual([
      "$var.later.answered: 'later' is asked after this point",
    ]);
    expect(messages([questionVar("q", { ...confirmVariable, question: "{{ $var.q.answered }}" })])).toEqual([
      "$var.q.answered: a question can't refer to itself",
    ]);
    expect(messages([topCondition("c", [questionVar("inner")], { script: "$var.inner.answered" })])).toEqual([
      "$var.inner.answered: 'inner' is inside this condition",
    ]);
  });

  it("rejects refs into another loop, and $unit and snippets outside a loop", () => {
    const items = [
      unitLoop("a", [questionVar("qa")]),
      unitLoop("b", [inLoopCondition("c", [questionVar("qb")], { script: "$var.qa.answered" })]),
      questionVar("after", { ...confirmVariable, question: "$unit.headline and [[x]]" }),
    ];
    expect(messages(items)).toEqual([
      "$var.qa.answered: 'qa' is a question of another unit loop (a)",
      "Snippets ([[name]]) can only be used in a unit loop's layout and its questions' texts",
      "$unit.headline can only be used inside a unit loop",
    ]);
    expect(messages([unitLoop("l", [questionVar("q")], "[[nope]]")])).toEqual([
      "[[nope]]: there is no snippet 'nope' in this loop's layout",
    ]);
  });

  it("checks that the property or method fits the question type", () => {
    const check = (script: string) =>
      messages([role, topics, interest, questionVar("c", confirmVariable), topCondition("x", [questionVar("q")], { script })]);
    expect(check("$var.role.texts")).toEqual([`$var.role.texts: "role" is a nominal question, which has no .texts; use .value, .label or .answered`]);
    expect(check("$var.interest.value")).toEqual([
      `$var.interest.value: "interest" is a scale, which has no .value; use .values, .items.<item> or .answered`,
    ]);
    expect(check("$var.interest.items.food.value")).toEqual(["$var.interest.items.food.value: 'food' is not an item of 'interest'"]);
    expect(check("$var.c.value")).toEqual([`$var.c.value: "c" is a confirm question, which has no .value; use .answered`]);
    expect(check("$var.topics.is('a')")).toEqual([
      `"topics" is a nominal question with multiple answers, which does not support "is"; use "has", "has any of", "has all of" or "count"`,
    ]);
    expect(check("$var[name].value")).toEqual(["Names after $var must be literal ($var.name), not computed ($var[...])"]);
    expect(check("Object.keys($var)")).toEqual(["$var must be followed by a name ($var.name)"]);
  });

  it("checks the arguments of helpers in simple conditions", () => {
    const check = (script: string) => messages([role, topics, edu, age, interest, topCondition("x", [questionVar("q")], { script })]);
    expect(check(`$var.role.isAny("student", "prof")`)).toEqual([
      `"prof" is not an answer option of "role" ("student", "researcher")`,
    ]);
    expect(check(`$var.edu.gte("2")`)).toEqual([`"2" is not an answer option of "edu" (1, 2, 3)`]);
    expect(check(`$var.edu.gte(4)`)).toEqual([`4 is not an answer option of "edu" (1, 2, 3)`]);
    // Numeric codes: `is(2)` for the value "2" (but not "02")
    const codes = questionVar("codes", select(["1", "2"]));
    const checkCodes = (script: string) => messages([codes, topCondition("x", [questionVar("q")], { script })]);
    expect(checkCodes(`$var.codes.is(2)`)).toEqual([]);
    expect(checkCodes(`$var.codes.isAny(1, "2")`)).toEqual([]);
    expect(checkCodes(`$var.codes.is(3)`)).toEqual([`3 is not an answer option of "codes" ("1", "2")`]);
    expect(check(`$var.age.between(18)`)).toEqual([`"between" needs 2 values`]);
    expect(check(`$var.age.gt(200)`)).toEqual([`200 is outside the range of "age" (0 to 120)`]);
    expect(check(`$var.topics.hasAll()`)).toEqual([`"has all of" needs at least 1 value`]);
    expect(check(`$var.interest.items.tech.is(3)`)).toEqual([`3 is not an answer option of "interest › tech" (1, 5)`]);
    expect(check(`$var.topics.count() > 1 && $var.age.between(18, 65)`)).toEqual([]);
    // Advanced scripts: references are checked, values not.
    expect(check(`$var.role.is("prof") || $unit.x`)).toEqual(["$unit.x can only be used inside a unit loop"]);
  });

  it("flags unknown properties", () => {
    expect(messages([role, topCondition("x", [questionVar("q")], { script: "$var.role.code === 'a'" })])).toEqual([
      "$var.role.code: unknown property; use .value, .label, .values, .labels, .texts, .answered, .items or a method",
    ]);
  });

  it("requires span fields to be unit fields the layout shows as plain text", () => {
    const span = (...fields: string[]) => questionVar("s", { type: "span", question: "?", fields, options: [{ value: "x" }] });
    expect(messages([unitLoop("l", [span("text")], "$unit.text::markdown")])).toEqual([
      "Span question 's' selects text in the unit field 'text', but the layout doesn't show it as plain text ($unit.text)",
    ]);
    expect(messages([unitLoop("l", [span("headline", "text")], "# $unit.headline\n\n{{$unit.text}}")])).toEqual([]);
    // A text block isn't a unit field: its text isn't kept as it was shown
    expect(messages([unitLoop("l", [span("summary")], "::: text summary\n{{ $unit.text.slice(0, 100) }}\n:::")])).toEqual([
      "Span question 's' selects text in the unit field 'summary', but the layout doesn't show it as plain text ($unit.summary)",
    ]);
  });

  it("checks typed blocks: no suffixes inside, no nesting, unique names; and suffixes outside {{ }}", () => {
    const loop = (template: string) => [unitLoop("l", [questionVar("q")], template)];
    expect(messages(loop("::: markdown intro\nHi **$unit.name**\n:::\n::: html\n<b>{{ $unit.n * 2 }}</b>\n:::"))).toEqual([]);
    expect(messages(loop("::: markdown\n$unit.photo::image\n:::"))).toEqual([
      "Inside a ::: markdown block values are put in as they are: leave out ::image",
    ]);
    expect(messages(loop("::: markdown\n::: html\nx\n:::\n:::"))).toEqual(["A ::: html block can't be inside a ::: markdown block"]);
    expect(messages(loop("::: text a\nx\n:::\n::: text a\ny\n:::"))).toEqual(["Two blocks are named 'a': names must be unique"]);
    expect(messages(loop("{{ $unit.text::markdown }}"))).toEqual([expect.stringContaining("A suffix goes after the }}")]);
    // Styles are markdown: only in a markdown block
    expect(messages(loop("::: markdown\n:::: style color: red\nx\n::::\n:::"))).toEqual([]);
    expect(messages(loop("::: text t\n:::: style color: red\nx\n::::\n:::"))).toEqual([
      "A ::: style block can't be inside a ::: text block (it can be inside ::: markdown)",
    ]);
  });

  it("checks templates with their snippets put in: anywhere, without suffix, not including themselves", () => {
    const group = questionVar("group", select(["a", "b"]));
    const loop = (template: string, snippets: Record<string, string>) => [group, unitLoop("l", [questionVar("q")], template, snippets)];
    expect(messages(loop("[[banner]]\n\n$unit.text", { banner: "::: style color: blue\n> **Hi** $unit.headline\n:::" }))).toEqual([]);
    expect(messages(loop("::: if [[cond]]\nx\n:::\n{{ [[n]] + 1 }}", { cond: "$var.group.is('a')", n: "$unit.n" }))).toEqual([]);
    expect(messages(loop("[[banner]]", { banner: "::: if $var.group.is('c')\nx\n:::" }))).toEqual([expect.stringContaining('"c"')]);
    expect(messages(loop("[[banner]]::markdown", { banner: "x" }))).toEqual([
      "[[banner]]::markdown: a snippet takes no suffix (it is pasted into the template as it is)",
    ]);
    expect(messages(loop("[[banner]]", { banner: "[[inner]]", inner: "[[banner]]" }))).toEqual([
      "[[banner]]: the snippet includes itself (banner → inner → banner)",
    ]);
    // Not in condition items (their scripts aren't the layout's text) or end items (shown outside the layout)
    const withSnippet = (child: InLoopItem) => [group, unitLoop("l", [questionVar("q"), child], "x", { cond: "$var.group.is('a')" })];
    expect(messages(withSnippet(inLoopCondition("c", [questionVar("r")], { script: "[[cond]]" })))).toEqual([expect.stringContaining("Snippets ([[name]]) can only be used")]);
    expect(messages(withSnippet({ type: "end", name: "e", outcome: "complete", message: "[[cond]]" } as InLoopItem))).toEqual([
      expect.stringContaining("Snippets ([[name]]) can only be used"),
    ]);
  });

  it("checks a question's focus: ids the layout shows, only in a loop", () => {
    const q = (...focus: string[]) => questionVar("q", { ...confirmVariable, focus });
    expect(messages([unitLoop("l", [q("unit.text", "unit.headline")], "# $unit.headline\n\n$unit.text::markdown")])).toEqual([]);
    expect(messages([unitLoop("l", [q("intro")], "::: markdown intro\nhi\n:::")])).toEqual([]);
    expect(messages([unitLoop("l", [q("unit.body")], "$unit.text")])).toEqual(["'unit.body' is not shown in the layout (as $unit.body)"]);
    expect(messages([q("unit.text")])).toEqual(["Focus only works for questions in a unit loop"]);
  });


  it("checks blocks: conditions, from stages (which make earlier loop answers available) and their structure", () => {
    const group = questionVar("group", select(["a", "b"]));
    const loop = (template: string) => [group, unitLoop("l", [questionVar("sentiment", select(["pos", "neg"])), questionVar("topics")], template)];
    const ok = "::: if $var.group.is('a')\n$unit.text\n::: else\nB\n:::\n::: from topics\nYou said $var.sentiment.label\n:::";
    expect(messages(loop(ok))).toEqual([]);
    expect(messages(loop("You said $var.sentiment.label"))).toEqual(["$var.sentiment.label: 'sentiment' is answered in this loop; use it inside ::: from topics"]);
    expect(messages(loop("::: from sentiment\n$var.sentiment.label\n:::"))).toEqual([
      "$var.sentiment.label: 'sentiment' is answered in this loop; use it inside ::: from topics",
    ]);
    expect(messages(loop("::: from nope\nx\n:::"))).toEqual(["::: from nope: 'nope' is not a question of this loop"]);
    expect(messages(loop("::: if $var.group.is('c')\nx\n:::"))).toEqual([expect.stringContaining('"c"')]);
    expect(messages(loop("::: if $var.group.is('a')\nx"))).toEqual(["::: if is not closed (end it with :::)"]);
    expect(messages([group, questionVar("q", { ...confirmVariable, question: "::: from group\nx\n:::" })])).toEqual([
      "::: from only works in a unit layout",
    ]);
  });
});

describe("question types", () => {
  const parse = (variable: object) => DesignItemsSchema.safeParse([questionVar("q", variable)]);
  // What the editor shows (validateDesignItems), checked against the schema.
  const errorsOf = (variable: object) => {
    const messages = validateDesignItems([questionVar("q", variable)]).map((i) => i.message);
    expect(parse(variable).success).toBe(messages.length === 0);
    return messages;
  };

  it("types option values by level", () => {
    expect(errorsOf(select(["a", "b"]))).toEqual([]);
    expect(errorsOf({ type: "nominal", question: "?", options: [{ value: 1 }] })).toEqual([
      "Nominal values are text (numbers rising in order: use an ordinal question)",
    ]);
    expect(errorsOf(select(["a", "a"]))).toEqual(["Duplicate value 'a'"]);
    expect(errorsOf(select([" a"]))).toEqual(["' a' has spaces around it"]);
    expect(errorsOf({ type: "ordinal", question: "?", options: [{ value: 1 }, { value: 3 }] })).toEqual([]);
    expect(errorsOf({ type: "ordinal", question: "?", options: [{ value: 2 }, { value: 1 }] })).toEqual([
      "Ordinal values must rise in the order of the options (1 after 2)",
    ]);
  });

  it("takes 2 or 3 swipe options", () => {
    const swipe = (n: number) => ({ type: "annotinder", question: "?", options: ["l", "r", "u", "x"].slice(0, n).map((value) => ({ value })) });
    expect(errorsOf(swipe(1))).toEqual(["Swiping needs 2 or 3 options (left, right, up)"]);
    expect(errorsOf(swipe(3))).toEqual([]);
    expect(errorsOf(swipe(4))).toEqual(["Swiping takes at most 3 options (left, right, up)"]);
  });

  it("checks numeric ranges and scales", () => {
    expect(errorsOf({ type: "numeric", question: "?", min: 0, max: 10, layout: "buttons" })).toEqual([]);
    expect(errorsOf({ type: "numeric", question: "?", min: 0, layout: "slider" })).toEqual(["Layout slider needs both min and max"]);
    expect(errorsOf({ type: "scale", question: "?", items: [], options: [{ value: 1 }] })).toEqual(["A scale needs at least one item"]);
  });
});

describe("end items", () => {
  const end = (extra: object = {}) => ({ type: "end", name: "stop", outcome: "screenout", ...extra });

  it("can end the session inside a condition, with a message and a redirect", () => {
    const items = [
      { type: "session", params: [{ name: "pid", kind: "url", values: { open: {} } }] },
      questionVar("consent", select(["yes", "no"])),
      topCondition("gate", [end({ message: "Thanks, $session.pid", redirectUrl: "https://panel.example/end?id=$session.pid" })] as never, {
        script: `$var.consent.is("no")`,
      }),
      unitLoop("l", [inLoopCondition("check", [end({ name: "fail", outcome: "complete" }) as never], { script: "$unit.x > 1" })]),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("checks the redirect URL", () => {
    expect(messages([end({ redirectUrl: "panel.example/end" })])).toEqual(["The redirect URL must start with https:// (or http://)"]);
    expect(messages([end({ redirectUrl: "https://x/{{ 1 }}" })])).toEqual(["Redirect URLs can only use $var and $session references, not {{ }}"]);
    expect(() => DesignItemsSchema.parse([end({ outcome: "done" })])).toThrow();
    // The session's values (participant id, required URL parameters) fit a panel's return link
    expect(messages([end({ redirectUrl: "https://panel.example/end?id=$session.participant" })])).toEqual([]);
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

describe("practice and gold units", () => {
  const loop = (units: object, template = "$unit.text") => ({
    type: "unit_loop",
    units: { overlap: { placement: "spread" }, ...units },
    layout: { template },
    children: [questionVar("sentiment", select(["pos", "neg"])), questionVar("note", { type: "unspecified" })],
  });
  const end = { type: "end", name: "low_quality", outcome: "screenout" };

  it("check loop questions with a value to compare, and a screen-out end item", () => {
    const ok = loop({ practice: { placement: "first", questions: ["sentiment"] }, gold: { placement: "spread", questions: ["sentiment"], health: { start: 3, wrong: -1, end: "low_quality" } } });
    expect(messages([ok, end]).filter((m) => /practice|gold|end item/i.test(m))).toEqual([]);
    const bad = loop({ gold: { placement: "spread", questions: ["nope", "note"], health: { start: 3, wrong: -1, end: "missing" } } });
    expect(messages([bad, end])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Gold question 'nope' is not a question in this loop"),
        expect.stringContaining("'note' can't be checked"),
        expect.stringContaining("No end item 'missing'"),
      ]),
    );
  });

  it("keep the answer columns hidden from coders", () => {
    const shown = loop({ gold: { placement: "first", questions: ["sentiment"] } }, "$unit.text $unit.sentiment_gold");
    expect(messages([shown])).toEqual(expect.arrayContaining([expect.stringContaining("sentiment_gold is shown to coders")]));
  });
});
