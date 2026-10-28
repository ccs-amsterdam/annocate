import { describe, expect, it } from "vitest";
import type { TopLevelItem, InLoopItem, TopLevelQuestionItem, InLoopQuestionItem } from "./item.js";
import { availableQuestions, validateCodebookItems } from "./validation.js";
import { CodebookItemsSchema } from "./codebook.js";
import type { Condition } from "./condition.js";

const confirmVariable = { type: "confirm" as const, question: "Confirm?" };

/** A question usable at the top level and in loops; `variable` is unchecked test data. */
function questionVar(name: string, variable: object = confirmVariable): TopLevelQuestionItem & InLoopQuestionItem {
  return { type: "question", name, variable } as TopLevelQuestionItem & InLoopQuestionItem;
}
function unitLoop(name: string, children: InLoopItem[], template = "", snippets?: Record<string, string>): TopLevelItem {
  return { type: "unit_loop", label: name, units: [{ mode: "all", unitset: "__all__" }], layout: { template, snippets }, children };
}
function topCondition(name: string, children: TopLevelItem[], condition: Condition = { script: "true" }): TopLevelItem {
  return { type: "condition", label: name, condition, children };
}
function inLoopCondition(name: string, children: InLoopItem[], condition: Condition = { script: "true" }): InLoopItem {
  return { type: "condition", label: name, condition, children };
}
const select = (values: string[], extra: object = {}) => ({
  type: "nominal",
  question: "?",
  options: values.map((value) => ({ value })),
  ...extra,
});
const messages = (items: unknown[]) => validateCodebookItems(items).map((i) => i.message);

describe("validateCodebookItems", () => {
  it("accepts a minimal valid tree codebook", () => {
    const items: TopLevelItem[] = [unitLoop("loop", [questionVar("q1")])];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("checks that loop branches refer to preceding coder variables", () => {
    const slot = questionVar("slot", { type: "auto", source: "invite", options: [{ value: "1" }, { value: "2" }] });
    const loop = (units: unknown): TopLevelItem =>
      ({ type: "unit_loop", label: "loop", units, layout: { template: "" }, children: [questionVar("q1", select(["a", "b"])), questionVar("c1")] }) as TopLevelItem;

    const valid: TopLevelItem[] = [
      slot,
      loop([
        {
          when: { script: `$var.slot.isAny("1", "2")` },
          mode: "all",
          unitset: "part_$var.slot.value",
          overlap: { unitset: "overlap" },
        },
        {
          mode: "shared",
          unitset: "pool",
          until: { agree: 2, on: "q1" },
          maxCoders: 4,
        },
      ]),
    ];
    expect(validateCodebookItems(valid)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(valid)).not.toThrow();

    const when = (value: string) => ({ script: `$var.slot.is("${value}")` });
    // variable defined after the loop
    expect(messages([loop([{ when: when("1"), mode: "all", unitset: "a" }]), slot])).toEqual([
      "$var.slot.is: 'slot' is asked after this point",
    ]);
    expect(messages([slot, loop([{ when: when("3"), mode: "all", unitset: "a" }])])).toEqual([
      `"3" is not an answer option of "slot" ("1", "2")`,
    ]);
    expect(messages([slot, loop([{ mode: "all", unitset: "part_$var.group.value" }])])).toEqual([
      "$var.group.value: 'group' is not a question",
    ]);
    // a question of the loop itself, or $unit, can't route
    expect(
      messages([slot, loop([{ when: { script: "$var.q1.answered" }, mode: "all", unitset: "a" }])]),
    ).toEqual(["$var.q1.answered: branches and unitset names can only use coder-level questions from before the loop"]);
    expect(messages([slot, loop([{ when: { script: "$unit.x > 1" }, mode: "all", unitset: "a" }])])).toEqual([
      "$unit.x: branches and unitset names can only use coder-level $var references",
    ]);
    expect(
      messages([slot, loop([{ mode: "shared", unitset: "a", until: { agree: 2, on: "nope" }, maxCoders: 3 }])]),
    ).toEqual(["Agreement question 'nope' is not a question in this loop"]);
    expect(
      messages([slot, loop([{ mode: "shared", unitset: "a", until: { agree: 2, on: "c1" }, maxCoders: 3 }])]),
    ).toEqual([
      `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "c1" is a confirm question`,
    ]);
  });

  it("requires maxCoders with an agreement rule", () => {
    const items = [
      {
        type: "unit_loop",
        label: "loop",
        units: [{ mode: "shared", unitset: "a", until: { agree: 2, on: "q1" } }],
        layout: { template: "" },
        children: [questionVar("q1")],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow(/Max coders is required/);
  });

  it("checks the settings of each mode", () => {
    const loop = (branch: object) => [
      { type: "unit_loop", label: "loop", units: [branch], layout: { template: "" }, children: [questionVar("q1", select(["a", "b"]))] },
    ];
    expect(messages(loop({ mode: "shared", unitset: "a", until: { coders: 3 }, maxCoders: 2 }))).toEqual([
      "Max coders must be at least the number of coders (or agreeing coders) a unit needs",
    ]);
    expect(messages(loop({ mode: "shared", unitset: "a", until: { coders: 1 }, overlap: { unitset: "o", placement: "spread" } }))).toEqual([
      "Spreading the overlap units needs max units per coder (to know where to put them)",
    ]);
    expect(messages(loop({ mode: "shared", unitset: "a", until: { coders: 1 }, maxUnits: 10, overlap: { unitset: "o", placement: "spread" } }))).toEqual([]);
    expect(messages(loop({ mode: "sets", unitsets: [] }))).toEqual(["Choose at least one unitset"]);
    expect(messages(loop({ mode: "sets", unitsets: ["a", "b_$var.x.value"] }))).toEqual([
      `"b_$var.x.value": the sets to choose from are plain unitset names, without $var references`,
    ]);
    expect(messages(loop({ mode: "invitation", overlap: { unitset: "o" } }))).toEqual([]);
  });

  it("allows questions and condition items outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent"),
      topCondition("gate", [questionVar("followup")]),
      unitLoop("loop", [questionVar("q1")]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
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
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
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
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("can only be used inside a unit_loop"))).toBe(true);
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("allows condition items nested inside a unit_loop", () => {
    const items: TopLevelItem[] = [
      unitLoop("loop", [inLoopCondition("gate", [questionVar("q1")])]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects duplicate names across the entire tree", () => {
    const items: TopLevelItem[] = [
      questionVar("dup_name"),
      unitLoop("loop", [questionVar("dup_name")]),
    ];
    const issues = validateCodebookItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate name 'dup_name'"))).toBe(true);
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects a unit_loop with no children via schema", () => {
    const items = [
      {
        type: "unit_loop",
        label: "empty_loop",
        units: [{ mode: "all", unitset: "main" }],
        layout: { template: "" },
        children: [],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("rejects nested unit_loops via schema", () => {
    const items = [
      {
        type: "unit_loop",
        label: "outer",
        units: [{ mode: "all", unitset: "main" }],
        layout: { template: "" },
        children: [
          {
            type: "unit_loop",
            label: "inner",
            units: [{ mode: "all", unitset: "main" }],
            layout: { template: "" },
            children: [questionVar("q1")],
          },
        ],
      },
    ];
    expect(() => CodebookItemsSchema.parse(items)).toThrow();
  });

  it("detects empty and invalid names via validateCodebookItems", () => {
    const emptyNameItems: TopLevelItem[] = [questionVar("")];
    const emptyIssues = validateCodebookItems(emptyNameItems);
    expect(emptyIssues.some((i) => i.message.includes("cannot be empty"))).toBe(true);

    const invalidNameItems: TopLevelItem[] = [questionVar("invalid name with spaces!")];
    const invalidIssues = validateCodebookItems(invalidNameItems);
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
    expect(validateCodebookItems(items)).toEqual([]);
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
  const parse = (variable: object) => CodebookItemsSchema.safeParse([questionVar("q", variable)]);
  // What the editor shows (validateCodebookItems), checked against the schema.
  const errorsOf = (variable: object) => {
    const messages = validateCodebookItems([questionVar("q", variable)]).map((i) => i.message);
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
    const pid = questionVar("pid", { type: "auto", source: "url_param", urlParam: "pid" });
    const items = [
      pid,
      questionVar("consent", select(["yes", "no"])),
      topCondition("gate", [end({ message: "Thanks, $var.pid.value", redirectUrl: "https://panel.example/end?id=$var.pid.value" })] as never, {
        script: `$var.consent.is("no")`,
      }),
      unitLoop("l", [inLoopCondition("check", [end({ name: "fail", outcome: "complete" }) as never], { script: "$unit.x > 1" })]),
    ];
    expect(validateCodebookItems(items)).toEqual([]);
    expect(() => CodebookItemsSchema.parse(items)).not.toThrow();
  });

  it("checks the redirect URL", () => {
    expect(messages([end({ redirectUrl: "panel.example/end" })])).toEqual(["The redirect URL must start with https:// (or http://)"]);
    expect(messages([end({ redirectUrl: "https://x/{{ 1 }}" })])).toEqual(["Redirect URLs can only use $var references, not {{ }}"]);
    expect(() => CodebookItemsSchema.parse([end({ outcome: "done" })])).toThrow();
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
