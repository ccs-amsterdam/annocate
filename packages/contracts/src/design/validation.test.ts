import { describe, expect, it } from "vitest";
import {
  TopLevelItemSchema,
  type TopLevelItem,
  type InLoopItem,
  type TopLevelQuestionItem,
  type InLoopQuestionItem,
} from "./item.js";
import { availableQuestions, validateDesignItems } from "./validation.js";
import { DesignItemsSchema, DesignWriteSchema } from "./designVersion.js";
import type { Condition } from "./condition.js";

const confirmVariable = { type: "confirm" as const, question: "Confirm?" };

/** A question usable at the top level and in loops; `variable` is unchecked test data. */
function questionVar(name: string, variable: object = confirmVariable): TopLevelQuestionItem & InLoopQuestionItem {
  return { type: "question", name, variable } as TopLevelQuestionItem & InLoopQuestionItem;
}
function unitLoop(
  name: string,
  children: InLoopItem[],
  template = "",
  snippets?: Record<string, string>,
): TopLevelItem {
  // A layout item first, when there is a template
  const layout: InLoopItem[] = template || snippets ? [{ type: "layout", template, snippets }] : [];
  return { type: "unit_loop", label: name, children: [...layout, ...children] };
}
function topBranch(name: string, children: TopLevelItem[], condition: Condition = { script: "true" }): TopLevelItem {
  return { type: "branch", label: name, condition, children };
}
function inLoopBranch(name: string, children: InLoopItem[], condition: Condition = { script: "true" }): InLoopItem {
  return { type: "branch", label: name, condition, children };
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
    const items = [
      questionVar("age", { type: "unspecified" }),
      unitLoop("loop", [questionVar("topic", { type: "unspecified" })]),
    ];
    // A valid shape (a draft can be saved); not publishable
    expect(TopLevelItemSchema.array().safeParse(items).success).toBe(true);
    expect(DesignItemsSchema.safeParse(items).success).toBe(false);
    expect(messages(items)).toEqual([
      "Question 'age' has no answer type yet: choose one",
      "Question 'topic' has no answer type yet: choose one",
    ]);
  });

  it("checks a loop's units: a part, test units placed, and the checks on practice and gold units", () => {
    const loop = (units: object) => [
      {
        type: "unit_loop",
        label: "loop",
        units,
        children: [{ type: "layout", template: "" }, questionVar("q1", select(["a", "b"]))],
      },
    ];
    expect(messages(loop({}))).toEqual([]);
    expect(messages(loop({ part: "post", coding: false, overlap: "ignore", practice: "before" }))).toEqual([]);
    expect(messages(loop({ overlap: "first" }))).toEqual([expect.stringContaining("Invalid option")]);
    expect(messages(loop({ part: "a;b" }))).toEqual([expect.stringContaining("no ; or #")]);
    expect(messages(loop({ mode: "all" }))).toEqual([]); // unknown keys are dropped
    // Branches are gone: a list of settings is not a loop's units
    expect(DesignItemsSchema.safeParse(loop([{}] as unknown as object)).success).toBe(false);
  });

  it("checks experiments: outside loops; one selects units, with a crowd", () => {
    const random = (extra: object, name = "set") => ({
      type: "experiment",
      name,
      variable: { type: "random", draw: "balanced", ...extra },
    });
    const loop = unitLoop("loop", [questionVar("q1")]);
    expect(messages([random({ units: true }), loop])).toEqual([]);
    expect(messages([random({ options: [{ value: "a" }] }), loop])).toEqual([]);
    expect(messages([random({})])).toEqual(["List the values, or select units by the units' condition_set"]);
    // Usable as $var.<name> after it
    const after = { ...loop, condition: { script: `$var.set.is("a")` } };
    expect(messages([random({ options: [{ value: "a" }, { value: "b" }] }), after])).toEqual([]);
    expect(messages([after, random({ options: [{ value: "a" }] })])).toEqual([
      "$var.set.is: 'set' is asked after this point",
    ]);
    // Not in a loop
    expect(
      messages([
        unitLoop("loop", [questionVar("q1"), random({ options: [{ value: "a" }] }, "inner") as unknown as InLoopItem]),
      ]),
    ).toContain("Experiment 'inner' can only be used outside a unit loop");
    // A loop before it doesn't use it: a warning
    expect(validateDesignItems([loop, random({ units: true })])).toEqual([
      expect.objectContaining({ warning: true, message: expect.stringContaining("comes before experiment 'set'") }),
    ]);
    // Conditions with their own units only for a crowd: expert coders get their coder set
    const session = { type: "session", invite: { mode: "coders", link: "per_coder" } };
    expect(messages([session, random({ units: true }), loop])).toEqual([
      expect.stringContaining("Experiment 'set' selects units by condition, but expert coders"),
    ]);
    const param = { type: "session", urlParams: [{ name: "set" }] };
    expect(messages([param, random({ units: true })])).toEqual([
      "Experiment 'set' selects units: its name can't also be a session value",
    ]);
    expect(messages([random({ units: true }), random({ units: true }, "other")])).toEqual([
      "Experiment 'set' already selects units: only one experiment can select units",
    ]);
    // One that doesn't select units can sit next to it
    expect(messages([random({ units: true }), random({ options: [{ value: "a" }] }, "other")])).toEqual([]);
  });

  it("checks a condition from a URL parameter: declared, its values the conditions", () => {
    const experiment = (variable: object) => ({
      type: "experiment",
      name: "arm",
      variable: { type: "random", draw: "url_param", param: "arm_param", ...variable },
    });
    const study = (values?: string[]) => ({
      type: "session",
      urlParams: [{ name: "arm_param", ...(values ? { values: values.map((value) => ({ value })) } : {}) }],
    });
    const ab = { options: [{ value: "a" }, { value: "b" }] };
    expect(messages([study(["a", "b"]), experiment(ab)])).toEqual([]);
    expect(messages([study(["a", "b"]), experiment({ units: true })])).toEqual([]);
    expect(messages([experiment(ab)])).toEqual([
      "Experiment 'arm': no URL parameter 'arm_param' (declare it in the Study entry)",
    ]);
    expect(messages([study(), experiment(ab)])).toEqual([
      "Experiment 'arm': list the values of URL parameter 'arm_param' (its values are the conditions)",
    ]);
    expect(messages([study(["a", "c"]), experiment(ab)])).toEqual([
      "Experiment 'arm': the values of URL parameter 'arm_param' must be its conditions (not a condition: c) (not a value: b)",
    ]);
    // A parameter only with url_param, and url_param needs one
    expect(messages([study(["a", "b"]), experiment({ ...ab, param: undefined })])).toEqual([
      "Choose the URL parameter with the condition",
    ]);
    expect(
      messages([{ type: "experiment", name: "x", variable: { type: "random", draw: "random", param: "p", ...ab } }]),
    ).toEqual(["Only a condition from a URL parameter has a parameter"]);
  });
});

describe("the Session item", () => {
  const session = (extra: object) => ({ type: "session", ...extra });
  const q = questionVar("q1");

  it("expert coders: who codes which units is the units' coder_set (checked when deploying)", () => {
    const invite = { mode: "coders", link: "per_coder" };
    expect(DesignWriteSchema.safeParse({ items: [], session: { invite } }).success).toBe(true);
    expect(messages([session({ invite }), unitLoop("loop", [q], "$unit.text")])).toEqual([]);
  });

  it("declares $session names (its URL parameters and the built-in ones); others are refused", () => {
    const text = {
      type: "question",
      name: "q",
      variable: {
        type: "confirm",
        question: "Hi $session.channel, $session.source, $session.coder",
      },
    };
    expect(messages([session({ urlParams: [{ name: "channel" }] }), text])).toEqual([]);
    expect(messages([text])).toEqual([
      "$session.channel: no session parameter 'channel' (declare it in the Session item)",
    ]);
    // A crowd link's set is gone
    expect(messages([{ ...text, variable: { type: "confirm", question: "$session.group" } }])).toEqual([
      "$session.group: no session parameter 'group' (declare it in the Session item)",
    ]);
  });

  it("comes first, once; its URL parameters are named once, not built in, with one key each", () => {
    expect(messages([q, session({})])).toEqual(["The Session item comes first in the design, at the top"]);
    expect(messages([session({}), session({})])).toEqual(expect.arrayContaining(["A design has one Session item"]));
    expect(messages([session({ urlParams: [{ name: "a" }, { name: "a", param: "b" }] })])).toEqual([
      "Two URL parameters are named 'a'",
    ]);
    expect(messages([session({ urlParams: [{ name: "a" }, { name: "b", param: "a" }] })])).toEqual([
      "Two URL parameters use the key 'a'",
    ]);
    expect(
      messages([
        session({ urlParams: [{ name: "a", param: "PID" }], invite: { mode: "crowd", coderParam: { param: "PID" } } }),
      ]),
    ).toEqual(["Two URL parameters use the key 'PID'"]);
    expect(messages([session({ urlParams: [{ name: "source" }] })])).toContain(
      "coder and source are built in: choose another name",
    );
    expect(messages([session({ urlParams: [{ name: "x", values: [{ value: "a" }], default: "b" }] })])).toEqual([
      "The default 'b' is not one of the values",
    ]);
    expect(messages([session({ urlParams: [{ name: "x", values: [{ value: "a" }], pattern: "a" }] })])).toEqual([
      "Give values or a pattern, not both",
    ]);
  });

  it("checks the invitation: expert coders, or a crowd", () => {
    const loop = unitLoop("loop", [questionVar("q1", select(["a", "b"])), questionVar("c1")]);
    expect(messages([session({ invite: { mode: "coders", link: "per_coder" } }), loop])).toEqual([]);
    expect(messages([session({ invite: { mode: "crowd", maxCoders: 10 } })])).toEqual([]);
    // Without a unit loop the unit settings are kept, with a warning
    const warnings = (list: object[]) =>
      validateDesignItems(list as never)
        .filter((i) => i.warning)
        .map((i) => i.message);
    expect(warnings([session({ invite: { mode: "coders", link: "per_coder" } }), q])).toEqual([
      expect.stringContaining("no unit loop yet"),
    ]);
    expect(messages([session({ invite: { mode: "crowd", coderParam: { param: "PID", optional: true } } }), q])).toEqual(
      [],
    );
  });

  it("checks a loop's units against the invitation: dividing, an earlier loop's units", () => {
    const crowd = session({ invite: { mode: "crowd" } });
    const coders = session({ invite: { mode: "coders", link: "per_coder" } });
    let n = 0;
    const loop = (units: object) => {
      const [q, c] = n++ === 0 ? ["q1", "c1"] : [`q${n}`, `c${n}`];
      return {
        type: "unit_loop",
        units,
        children: [{ type: "layout", template: "" }, questionVar(q, select(["a", "b"])), questionVar(c)],
      };
    };
    const divide = (divide: object) => ((n = 0), loop({ divide }));
    expect(messages([crowd, divide({ until: { agree: 2, on: "q1" }, codersPerUnit: { max: 4 } })])).toEqual([]);
    expect(messages([crowd, divide({ until: { agree: 2, on: "nope" }, codersPerUnit: { max: 3 } })])).toEqual([
      "Agreement question 'nope' is not a question in this loop",
    ]);
    expect(messages([crowd, divide({ until: { agree: 2, on: "c1" }, codersPerUnit: { max: 3 } })])).toEqual([
      `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "c1" is a confirm question`,
    ]);
    expect(messages([crowd, divide({ until: { agree: 2, on: "q1" } })])).toEqual([
      expect.stringContaining("most coders per unit when coding until coders agree"),
    ]);
    expect(messages([crowd, divide({ codersPerUnit: { min: 3, max: 2 } })])).toEqual([
      "The most coders per unit must be at least the coders (or agreeing coders) a unit needs",
    ]);
    expect(messages([crowd, divide({ unitsPerCoder: { min: 5, max: 2 } })])).toEqual([
      "The minimum units per coder can't be more than the maximum",
    ]);
    expect(messages([coders, divide({ codersPerUnit: { min: 2 } })])).toEqual([
      expect.stringContaining("Dividing units among coders is for a crowd"),
    ]);
    n = 0;
    // A part of the coder's units, divided or not
    expect(messages([coders, loop({ part: "pre" })])).toEqual([]);
    n = 0;
    expect(messages([crowd, loop({ part: "pre", divide: {} })])).toEqual([]);
    n = 0;
    expect(messages([crowd, loop({}), loop({ sameAsPrevious: true })])).toEqual([]);
    n = 0;
    expect(messages([crowd, loop({ sameAsPrevious: true })])).toEqual([
      "There is no previous loop to take the units of",
    ]);
    n = 0;
    expect(messages([crowd, loop({}), loop({ sameAsPrevious: true, divide: {} })])).toEqual([
      "Taking the units of the previous loop, they aren't divided again: remove dividing",
    ]);
  });
});

describe("validateDesignItems (more)", () => {
  it("allows questions and condition items outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent"),
      topBranch("gate", [questionVar("followup")]),
      unitLoop("loop", [questionVar("q1")]),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("allows questions both inside and outside a unit_loop", () => {
    const items: TopLevelItem[] = [
      questionVar("consent", confirmVariable),
      unitLoop(
        "loop",
        [
          questionVar("sentiment", confirmVariable),
          questionVar("spans", {
            type: "span",
            question: "Highlight spans",
            fields: ["text"],
            options: [{ value: "tag" }],
          }),
        ],
        "$unit.text",
      ),
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
    const items: TopLevelItem[] = [unitLoop("loop", [inLoopBranch("gate", [questionVar("q1")])])];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("rejects duplicate names across the entire tree", () => {
    const items: TopLevelItem[] = [questionVar("dup_name"), unitLoop("loop", [questionVar("dup_name")])];
    const issues = validateDesignItems(items);
    expect(issues.some((i) => i.message.includes("Duplicate name 'dup_name'"))).toBe(true);
    expect(() => DesignItemsSchema.parse(items)).toThrow();
  });

  it("rejects a unit_loop with no children via schema", () => {
    const items = [
      {
        type: "unit_loop",
        label: "empty_loop",
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
        children: [
          { type: "layout", template: "" },
          {
            type: "unit_loop",
            label: "inner",
            children: [{ type: "layout", template: "" }, questionVar("q1")],
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
  const edu = questionVar("edu", {
    type: "ordinal",
    question: "?",
    options: [{ value: 1 }, { value: 2 }, { value: 3 }],
  });
  const age = questionVar("age", { type: "numeric", question: "?", min: 0, max: 120 });
  const interest = questionVar("interest", {
    type: "scale",
    question: "?",
    options: [{ value: 1 }, { value: 5 }],
    items: [{ name: "tech" }],
  });

  it("accepts references to earlier questions, in conditions, scripts and texts", () => {
    const items = [
      role,
      topics,
      interest,
      topBranch(
        "c1",
        [
          questionVar("why", {
            ...confirmVariable,
            question: "You are a $var.role.label. Topics: {{ $var.topics.labels.join(' ') }}",
          }),
        ],
        {
          script: `$var.role.is("student") || $var.topics.hasAny("a", "b") || $var.interest.items.tech.gte(5)`,
        },
      ),
      unitLoop(
        "loop",
        [
          questionVar("rel", select(["yes", "no"], { question: "Is [[subject]] in **$unit.headline**?" })),
          inLoopBranch("c2", [questionVar("q2")], {
            script: "$var.rel.value === 'yes' && $var.why.answered && $unit.n > 3",
          }),
          questionVar("q3", { ...confirmVariable, question: "{{ $var.q2.answered ? 'again' : '' }}" }),
        ],
        "# $unit.headline\n\n[[subject]]\n\n{{ $var.role.value }}",
        { subject: "politics" },
      ),
    ];
    expect(validateDesignItems(items)).toEqual([]);
  });

  it("rejects unknown $names in scripts, once, but not $ in text", () => {
    expect(
      messages([age, questionVar("q", { ...confirmVariable, question: "Costs $5. {{ $sesion.x + $var.age.foo }}" })]),
    ).toEqual([
      "$sesion is unknown: values are $var, $unit and $session",
      "$var.age.foo: unknown property; use .value, .label, .values, .labels, .texts, .special, .answered, .items or a method",
    ]);
    expect(messages([topBranch("c", [questionVar("q")], { script: "$vars.age > 1 && '$x' !== ''" })])).toEqual([
      "$vars is unknown: values are $var, $unit and $session",
    ]);
  });

  it("rejects forward references, self references and refs into a condition's own children", () => {
    expect(
      messages([topBranch("c", [questionVar("q")], { script: "$var.later.answered" }), role, questionVar("later")]),
    ).toEqual(["$var.later.answered: 'later' is asked after this point"]);
    expect(messages([questionVar("q", { ...confirmVariable, question: "{{ $var.q.answered }}" })])).toEqual([
      "$var.q.answered: a question can't refer to itself",
    ]);
    expect(messages([topBranch("c", [questionVar("inner")], { script: "$var.inner.answered" })])).toEqual([
      "$var.inner.answered: 'inner' is inside this condition",
    ]);
  });

  it("rejects refs into another loop, and $unit and snippets outside a loop", () => {
    const items = [
      unitLoop("a", [questionVar("qa")]),
      unitLoop("b", [inLoopBranch("c", [questionVar("qb")], { script: "$var.qa.answered" })]),
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
      messages([
        role,
        topics,
        interest,
        questionVar("c", confirmVariable),
        topBranch("x", [questionVar("q")], { script }),
      ]);
    expect(check("$var.role.texts")).toEqual([
      `$var.role.texts: "role" is a nominal question, which has no .texts; use .value, .label or .answered`,
    ]);
    expect(check("$var.interest.value")).toEqual([
      `$var.interest.value: "interest" is a scale, which has no .value; use .values, .items.<item> or .answered`,
    ]);
    expect(check("$var.interest.items.food.value")).toEqual([
      "$var.interest.items.food.value: 'food' is not an item of 'interest'",
    ]);
    expect(check("$var.c.value")).toEqual([
      `$var.c.value: "c" is a confirm question, which has no .value; use .answered`,
    ]);
    expect(check("$var.topics.is('a')")).toEqual([
      `"topics" is a nominal question with multiple answers, which does not support "is"; use "has", "has any of", "has all of" or "count"`,
    ]);
    expect(check("$var[name].value")).toEqual([
      "Names after $var must be literal ($var.name), not computed ($var[...])",
    ]);
    expect(check("Object.keys($var)")).toEqual(["$var must be followed by a name ($var.name)"]);
  });

  it("checks the arguments of helpers in simple conditions", () => {
    const check = (script: string) =>
      messages([role, topics, edu, age, interest, topBranch("x", [questionVar("q")], { script })]);
    expect(check(`$var.role.isAny("student", "prof")`)).toEqual([
      `"prof" is not an answer option of "role" ("student", "researcher")`,
    ]);
    expect(check(`$var.edu.gte("2")`)).toEqual([`"2" is not an answer option of "edu" (1, 2, 3)`]);
    expect(check(`$var.edu.gte(4)`)).toEqual([`4 is not an answer option of "edu" (1, 2, 3)`]);
    // Numeric codes: `is(2)` for the value "2" (but not "02")
    const codes = questionVar("codes", select(["1", "2"]));
    const checkCodes = (script: string) => messages([codes, topBranch("x", [questionVar("q")], { script })]);
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
    expect(messages([role, topBranch("x", [questionVar("q")], { script: "$var.role.code === 'a'" })])).toEqual([
      "$var.role.code: unknown property; use .value, .label, .values, .labels, .texts, .special, .answered, .items or a method",
    ]);
  });

  it("requires span fields to be unit fields the layout shows as plain text", () => {
    const span = (...fields: string[]) =>
      questionVar("s", { type: "span", question: "?", fields, options: [{ value: "x" }] });
    expect(messages([unitLoop("l", [span("text")], "$unit.text::markdown")])).toEqual([
      "Span question 's' selects text in the unit field 'text', but the layout doesn't show it as plain text ($unit.text)",
    ]);
    expect(messages([unitLoop("l", [span("headline", "text")], "# $unit.headline\n\n{{$unit.text}}")])).toEqual([]);
    // A text block isn't a unit field: its text isn't kept as it was shown
    expect(
      messages([unitLoop("l", [span("summary")], "::: text summary\n{{ $unit.text.slice(0, 100) }}\n:::")]),
    ).toEqual([
      "Span question 's' selects text in the unit field 'summary', but the layout doesn't show it as plain text ($unit.summary)",
    ]);
  });

  it("checks typed blocks: no suffixes inside, no nesting, unique names; and suffixes outside {{ }}", () => {
    const loop = (template: string) => [unitLoop("l", [questionVar("q")], template)];
    expect(
      messages(loop("::: markdown intro\nHi **$unit.name**\n:::\n::: html\n<b>{{ $unit.n * 2 }}</b>\n:::")),
    ).toEqual([]);
    expect(messages(loop("::: markdown\n$unit.photo::image\n:::"))).toEqual([
      "Inside a ::: markdown block values are put in as they are: leave out ::image",
    ]);
    expect(messages(loop("::: markdown\n::: html\nx\n:::\n:::"))).toEqual([
      "A ::: html block can't be inside a ::: markdown block",
    ]);
    expect(messages(loop("::: text a\nx\n:::\n::: text a\ny\n:::"))).toEqual([
      "Two blocks are named 'a': names must be unique",
    ]);
    expect(messages(loop("{{ $unit.text::markdown }}"))).toEqual([
      expect.stringContaining("A suffix goes after the }}"),
    ]);
    // Styles are markdown: only in a markdown block
    expect(messages(loop("::: markdown\n:::: style color: red\nx\n::::\n:::"))).toEqual([]);
    expect(messages(loop("::: text t\n:::: style color: red\nx\n::::\n:::"))).toEqual([
      "A ::: style block can't be inside a ::: text block (it can be inside ::: markdown)",
    ]);
  });

  it("checks templates with their snippets put in: anywhere, without suffix, not including themselves", () => {
    const group = questionVar("group", select(["a", "b"]));
    const loop = (template: string, snippets: Record<string, string>) => [
      group,
      unitLoop("l", [questionVar("q")], template, snippets),
    ];
    expect(
      messages(loop("[[banner]]\n\n$unit.text", { banner: "::: style color: blue\n> **Hi** $unit.headline\n:::" })),
    ).toEqual([]);
    expect(
      messages(loop("::: if [[cond]]\nx\n:::\n{{ [[n]] + 1 }}", { cond: "$var.group.is('a')", n: "$unit.n" })),
    ).toEqual([]);
    expect(messages(loop("[[banner]]", { banner: "::: if $var.group.is('c')\nx\n:::" }))).toEqual([
      expect.stringContaining('"c"'),
    ]);
    expect(messages(loop("[[banner]]::markdown", { banner: "x" }))).toEqual([
      "[[banner]]::markdown: a snippet takes no suffix (it is pasted into the template as it is)",
    ]);
    expect(messages(loop("[[banner]]", { banner: "[[inner]]", inner: "[[banner]]" }))).toEqual([
      "[[banner]]: the snippet includes itself (banner → inner → banner)",
    ]);
    // Not in condition items (their scripts aren't the layout's text) or end items (shown outside the layout)
    const withSnippet = (child: InLoopItem) => [
      group,
      unitLoop("l", [questionVar("q"), child], "x", { cond: "$var.group.is('a')" }),
    ];
    expect(messages(withSnippet(inLoopBranch("c", [questionVar("r")], { script: "[[cond]]" })))).toEqual([
      expect.stringContaining("Snippets ([[name]]) can only be used"),
    ]);
    expect(
      messages(withSnippet({ type: "end", name: "e", outcome: "complete", message: "[[cond]]" } as InLoopItem)),
    ).toEqual([expect.stringContaining("Snippets ([[name]]) can only be used")]);
  });

  it("checks a question's focus: ids the layout shows, only in a loop", () => {
    const q = (...focus: string[]) => questionVar("q", { ...confirmVariable, focus });
    expect(
      messages([unitLoop("l", [q("unit.text", "unit.headline")], "# $unit.headline\n\n$unit.text::markdown")]),
    ).toEqual([]);
    expect(messages([unitLoop("l", [q("intro")], "::: markdown intro\nhi\n:::")])).toEqual([]);
    expect(messages([unitLoop("l", [q("unit.body")], "$unit.text")])).toEqual([
      "'unit.body' is not shown in the layout (as $unit.body)",
    ]);
    expect(messages([q("unit.text")])).toEqual(["Focus only works for questions in a unit loop"]);
  });

  it("checks blocks: conditions, from stages (which make earlier loop answers available) and their structure", () => {
    const group = questionVar("group", select(["a", "b"]));
    const loop = (template: string) => [
      group,
      unitLoop("l", [questionVar("sentiment", select(["pos", "neg"])), questionVar("topics")], template),
    ];
    const ok =
      "::: if $var.group.is('a')\n$unit.text\n::: else\nB\n:::\n::: from topics\nYou said $var.sentiment.label\n:::";
    expect(messages(loop(ok))).toEqual([]);
    expect(messages(loop("You said $var.sentiment.label"))).toEqual([
      "$var.sentiment.label: 'sentiment' is answered in this loop; use it inside ::: from topics",
    ]);
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

describe("branches", () => {
  it("anything at the top level but end items; a loop only there, with an optional condition", () => {
    const q = questionVar("q1");
    const loop = unitLoop("loop", [questionVar("u1")]);
    const end = { type: "end", name: "stop", outcome: "screenout" };
    expect(validateDesignItems([q, loop])).toEqual([]);
    expect(validateDesignItems([q, end]).map((i) => i.message)).toEqual([
      "An end item goes in a branch (shown only if a condition holds)",
    ]);
    expect(
      validateDesignItems([q, { type: "branch", condition: { script: "$var.q1.answered" }, children: [end] }]),
    ).toEqual([]);
    // A condition is required; the label is optional
    const always = { script: "true" };
    expect(validateDesignItems([{ type: "branch", label: "Intro", condition: always, children: [q] }])).toEqual([]);
    expect(validateDesignItems([{ type: "branch", label: "Intro", children: [q] }]).map((i) => i.message)).toEqual([
      "A branch needs a condition: when its items are shown",
    ]);
    expect(validateDesignItems([{ type: "branch", condition: { script: "" }, children: [q] }])).toMatchObject([
      { path: [0, "condition", "script"], message: "The script is empty" },
    ]);
    expect(DesignItemsSchema.safeParse([{ type: "branch", children: [q] }]).success).toBe(false);
    expect(
      validateDesignItems([{ type: "branch", condition: always, children: [loop] }]).map((i) => i.message),
    ).toEqual(["A unit loop goes at the top level, not inside a branch (give the loop a condition instead)"]);
    // A loop's condition: on coder-level answers before it, never $unit
    expect(validateDesignItems([q, { ...loop, condition: { script: "$var.q1.answered" } }])).toEqual([]);
    expect(validateDesignItems([q, { ...loop, condition: { script: "$unit.text == 'a'" } }]).length).toBeGreaterThan(0);
  });

  it("else items: shown when the condition doesn't hold", () => {
    const q = questionVar("q1", select(["a", "b"]));
    const ifA = { type: "branch", condition: { script: `$var.q1.is("a")` }, children: [questionVar("x")] };
    expect(validateDesignItems([q, { ...ifA, elseChildren: [questionVar("y")] }])).toEqual([]);
    // Their names are checked like any other
    expect(validateDesignItems([q, { ...ifA, elseChildren: [questionVar("x")] }]).map((i) => i.message)).toEqual([
      "Duplicate name 'x'",
    ]);
    expect(DesignItemsSchema.safeParse([q, { ...ifA, elseChildren: [] }]).success).toBe(false);
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
    const swipe = (n: number) => ({
      type: "annotinder",
      question: "?",
      options: ["l", "r", "u", "x"].slice(0, n).map((value) => ({ value })),
    });
    expect(errorsOf(swipe(1))).toEqual(["Swiping needs 2 or 3 options (left, right, up)"]);
    expect(errorsOf(swipe(3))).toEqual([]);
    expect(errorsOf(swipe(4))).toEqual(["Swiping takes at most 3 options (left, right, up)"]);
  });

  it("checks numeric ranges and scales", () => {
    expect(errorsOf({ type: "numeric", question: "?", min: 0, max: 10, layout: "buttons" })).toEqual([]);
    expect(errorsOf({ type: "numeric", question: "?", min: 0, layout: "slider" })).toEqual([
      "Layout slider needs both min and max",
    ]);
    expect(errorsOf({ type: "scale", question: "?", items: [], options: [{ value: 1 }] })).toEqual([
      "A scale needs at least one item",
    ]);
  });
});

describe("end items", () => {
  const end = (extra: object = {}) => ({ type: "end", name: "stop", outcome: "screenout", ...extra });

  it("can end the session inside a condition, with a message and a redirect", () => {
    const items = [
      { type: "session", urlParams: [{ name: "pid" }] },
      questionVar("consent", select(["yes", "no"])),
      topBranch(
        "gate",
        [end({ message: "Thanks, $session.pid", redirectUrl: "https://panel.example/end?id=$session.pid" })] as never,
        {
          script: `$var.consent.is("no")`,
        },
      ),
      unitLoop("l", [
        inLoopBranch("check", [end({ name: "fail", outcome: "complete" }) as never], { script: "$unit.x > 1" }),
      ]),
    ];
    expect(validateDesignItems(items)).toEqual([]);
    expect(() => DesignItemsSchema.parse(items)).not.toThrow();
  });

  it("checks the redirect URL", () => {
    // End items go in a branch
    const inBranch = (extra: object) => ({ type: "branch", condition: { script: "true" }, children: [end(extra)] });
    expect(messages([inBranch({ redirectUrl: "panel.example/end" })])).toEqual([
      "The redirect URL must start with https:// (or http://)",
    ]);
    expect(messages([inBranch({ redirectUrl: "https://x/{{ 1 }}" })])).toEqual([
      "Redirect URLs can only use $var and $session references, not {{ }}",
    ]);
    expect(() => DesignItemsSchema.parse([inBranch({ outcome: "done" })])).toThrow();
    // The session's values (the coder, required URL parameters) fit a panel's return link
    expect(messages([inBranch({ redirectUrl: "https://panel.example/end?id=$session.coder" })])).toEqual([]);
  });
});

describe("availableQuestions", () => {
  it("lists earlier questions, in a loop including its earlier questions", () => {
    const items = [
      questionVar("a"),
      unitLoop("l", [questionVar("b"), inLoopBranch("c", [questionVar("d")]), questionVar("e")]),
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
    units: { overlap: "spread", ...units },
    children: [
      { type: "layout", template },
      questionVar("sentiment", select(["pos", "neg"])),
      questionVar("note", { type: "unspecified" }),
    ],
  });
  // An end item, in a branch
  const end = {
    type: "branch",
    condition: { script: "true" },
    children: [{ type: "end", name: "low_quality", outcome: "screenout" }],
  };

  it("check loop questions with a value to compare, and a screen-out end item", () => {
    const ok = loop({
      practice: "before",
      practiceCheck: { questions: ["sentiment"] },
      goldCheck: { questions: ["sentiment"], health: { start: 3, wrong: -1, end: "low_quality" } },
    });
    expect(messages([ok, end]).filter((m) => /practice|gold|end item/i.test(m))).toEqual([]);
    const bad = loop({
      goldCheck: { questions: ["nope", "note"], health: { start: 3, wrong: -1, end: "missing" } },
    });
    expect(messages([bad, end])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Gold question 'nope' is not a question in this loop"),
        expect.stringContaining("'note' can't be checked"),
        expect.stringContaining("No end item 'missing'"),
      ]),
    );
  });

  it("keep the answer and feedback columns hidden from coders, checked or not", () => {
    const shown = loop({ goldCheck: { questions: ["sentiment"] } }, "$unit.text $unit.answer_sentiment");
    expect(messages([shown])).toEqual(
      expect.arrayContaining([expect.stringContaining("answer_sentiment is shown to coders")]),
    );
    expect(messages([loop({}, "$unit.text {{$unit.feedback_other}}")])).toEqual(
      expect.arrayContaining([expect.stringContaining("feedback_other is shown to coders")]),
    );
    expect(messages([loop({}, "$unit.text $unit.answers")]).filter((m) => m.includes("shown to coders"))).toEqual([]);
  });
});

describe("instructions", () => {
  it("are for questions in unit loops, on the question item; at the top level the schema refuses them", () => {
    const loop = {
      type: "unit_loop",
      children: [
        { type: "layout", template: "$unit.text" },
        {
          type: "question",
          name: "topic",
          instruction: "Code the **headline**, $var.nope",
          instructionOpen: "first",
          variable: { type: "confirm", question: "?" },
        },
      ],
    };
    expect(validateDesignItems([loop] as never).map((i) => i.message)).toEqual([expect.stringContaining("nope")]);
    const top = {
      type: "question",
      name: "age",
      instruction: "Whole years",
      variable: { type: "numeric", question: "Age?" },
    };
    expect(validateDesignItems([top] as never).map((i) => i.message)).toContainEqual(
      "Instructions are for questions in unit loops: put details in the question text",
    );
  });
});
