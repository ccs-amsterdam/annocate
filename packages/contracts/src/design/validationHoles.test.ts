import { describe, expect, it } from "vitest";
import { validateDesignItems } from "./validation.js";
import { DesignItemsSchema, DesignWriteSchema } from "./designVersion.js";
import { fieldUsage, loopDependencies, shownUnitFields } from "./shownFields.js";
import { buildScope } from "./references.js";
import { toCoderItems } from "./coderCodebook.js";
import type { TopLevelItem } from "./item.js";
import type { AnyVariableType } from "./variableTypes.js";
import { StudyWriteSchema } from "../study.js";
import { UnitsSpecSchema, addedFields, fieldsOfUnits, inferFieldType, reservedColumnError } from "../unitFields.js";

const confirm = { type: "confirm", question: "?" };
const nominal = { type: "nominal", question: "?", options: [{ value: "a" }, { value: "b" }] };
const question = (name: string, variable: object = confirm) => ({ type: "question", name, variable });
const loop = (children: object[], extra: object = {}, layout: object = { template: "$unit.text" }) => ({
  type: "unit_loop",
  id: "loop_1",
  ...extra,
  children: [{ type: "layout", ...layout }, ...children],
});
const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);
const session = (extra: object) => ({ type: "session", ...extra });

describe("design validation: what a stored design can't hold", () => {
  it("1. a question's style takes only the CSS a layout's style takes", () => {
    const styled = (questionStyle: object) => [question("q", { ...confirm, questionStyle })];
    expect(messages(styled({ color: "darkred", fontSize: "120%" }))).toEqual([]);
    expect(messages(styled({ position: "fixed" }))).toEqual([expect.stringContaining("position isn't one of the CSS")]);
    expect(messages(styled({ color: "url(https://example.com/x.png)" }))).toEqual([
      expect.stringContaining("isn't allowed (no url(), image-set() or markup)"),
    ]);
  });

  it("2. a confirm question can't be a gold or practice question: its answer has no value", () => {
    const checked = (check: object) => [
      loop([question("seen"), question("topic", nominal)], { units: { practice: "before", gold: "spread", ...check } }),
    ];
    expect(messages(checked({ goldCheck: { questions: ["topic"] } }))).toEqual([]);
    expect(messages(checked({ goldCheck: { questions: ["seen"] } }))).toEqual([
      "'seen' can't be checked against a right answer: a confirm question (use nominal, ordinal, swipe or numeric)",
    ]);
    expect(messages(checked({ practiceCheck: { questions: ["seen"] } }))).toEqual([
      expect.stringContaining("'seen' can't be checked against a right answer"),
    ]);
  });

  it("3. a practice check's message is checked as a template, and the unit fields it uses are sent", () => {
    const withMessage = (message: string) => [
      loop([question("topic", nominal)], {
        units: { practice: "before", practiceCheck: { questions: ["topic"], message } },
      }),
    ];
    expect(messages(withMessage("See $unit.hint, you chose $var.topic.label"))).toEqual([]);
    expect(messages(withMessage("See $var.nope.label"))).toEqual([expect.stringContaining("'nope' is not a question")]);
    expect(messages(withMessage("{{ $unit.hint }}::nope"))).not.toEqual([]);
    expect(shownUnitFields(withMessage("See $unit.hint")).sort()).toEqual(["hint", "text"]);
    expect(fieldUsage(withMessage("See $unit.hint")).get("hint")).toBe("shown");
    // Right answers stay on the server: also out of the message, which would send them with every unit
    expect(messages(withMessage("It was $unit.answer_topic"))).toEqual([
      expect.stringContaining("The answer column answer_topic is shown to coders"),
    ]);
  });

  it("4. a loop's own condition makes its question one the loop depends on", () => {
    const items = [
      question("role", nominal),
      question("age", { type: "numeric", question: "?" }),
      loop([question("topic", nominal)], { condition: { script: '$var.role.is("a")' } }),
    ];
    expect(messages(items)).toEqual([]);
    expect(loopDependencies(items)).toEqual(new Map([["loop_1", ["role"]]]));
  });

  it("5. a URL parameter's default fits its pattern; a highlight's fields are shown by its layout", () => {
    const withParam = (param: object) => [session({ urlParams: [{ name: "panel", ...param }] }), question("q")];
    expect(messages(withParam({ pattern: "[0-9]{3}", default: "123" }))).toEqual([]);
    expect(messages(withParam({ pattern: "[0-9]{3}", default: "abc" }))).toEqual([
      "The default 'abc' doesn't match the pattern",
    ]);

    const highlighted = (fields: string[], template = "$unit.text $unit.body::markdown\n\n::: text quote\nHi\n:::") => [
      loop([question("q")], {}, { template, highlight: [{ query: "climate", fields }] }),
    ];
    expect(messages(highlighted(["text", "quote"]))).toEqual([]);
    expect(messages(highlighted(["text", "title"]))).toEqual([
      "Highlight field 'title' is not shown in this layout (as $unit.title or a ::: text block named 'title')",
    ]);
  });

  it("6. $var.<scale>.values has a place for every item: null for one without a value", () => {
    const scale: AnyVariableType = {
      type: "scale",
      question: "?",
      items: [{ name: "a" }, { name: "b" }, { name: "c" }],
      options: [{ value: 1 }, { value: 2 }],
      specials: [{ kind: "dont_know" }],
    };
    const answer = {
      done: true,
      skip: false,
      values: [
        { item: "a", value: 2 },
        { item: "c", special: "dont_know" as const },
      ],
    };
    expect(buildScope(new Map([["s", scale]]), { s: answer }).$var.s.values).toEqual([2, null, null]);
    expect(buildScope(new Map([["s", scale]]), {}).$var.s.values).toEqual([null, null, null]);
  });

  it("7. a study's redirect URLs are web addresses", () => {
    const study = (url: string) => StudyWriteSchema.safeParse({ name: "s", redirectUrls: { panel: url } });
    expect(study("https://panel.example/return?id=$session.pid").success).toBe(true);
    expect(study("http://localhost:3000/back").success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,x", "//example.com", "example.com", " https://a.b"]) {
      const result = study(url);
      expect([url, result.success]).toEqual([url, false]);
      expect(result.error?.issues[0].message).toBe("A redirect URL starts with https:// (or http://)");
    }
  });

  it("8. unit fields have valid names, each once", () => {
    const spec = (...names: string[]) =>
      UnitsSpecSchema.safeParse({ fields: names.map((name) => ({ name, type: "text" })) }).error?.issues.map(
        (i) => i.message,
      ) ?? [];
    expect(spec("text", "title_2", "_id")).toEqual([]);
    expect(spec("my field")).toEqual(["Field name 'my field': only letters, digits and _, not starting with a digit"]);
    expect(spec("1st")).toHaveLength(1);
    expect(spec("constructor")).toEqual(["Field name 'constructor': 'constructor' can't be used as a name"]);
    expect(spec("__proto__")).toHaveLength(1);
    expect(spec("a".repeat(65))).toEqual([expect.stringContaining("at most 64 characters")]);
    expect(spec("text", "title", "text")).toEqual(["Two fields are named 'text'"]);
    // The columns with a role keep their own type
    expect(UnitsSpecSchema.safeParse({ fields: [{ name: "coder_set", type: "set" }] }).success).toBe(true);

    expect(fieldsOfUnits([{ text: "a", "my field": "b" }])).toEqual({
      error: "Field name 'my field': only letters, digits and _, not starting with a digit",
    });
    expect(fieldsOfUnits([{ text: "a", n: 1 }])).toEqual({
      fields: [
        { name: "text", type: "text" },
        { name: "n", type: "number" },
      ],
    });
    expect(addedFields([{ text: "a", constructor: "b" }], [{ name: "text", type: "text" }])).toEqual({
      error: "Field name 'constructor': 'constructor' can't be used as a name",
    });
  });

  it("9. a CSV column is a number column only if every cell reads back as written", () => {
    expect(inferFieldType(["42", "-1.5", "", "0", "0.25"])).toBe("number");
    expect(inferFieldType([" 7 ", "8"])).toBe("number");
    // Ids and codes: a leading zero, more digits than a number holds, another spelling
    expect(inferFieldType(["01234", "56789"])).toBe("text");
    expect(inferFieldType(["1234567890123456789"])).toBe("text");
    expect(inferFieldType(["9007199254740993"])).toBe("text");
    expect(inferFieldType(["1e3", "2"])).toBe("text");
    expect(inferFieldType(["1.50"])).toBe("text");
    expect(inferFieldType(["+5"])).toBe("text");
  });

  it("10. coders don't get the editor's labels, nor an experiment's condition labels it doesn't show", () => {
    const experiment = (name: string, label: string) => ({
      type: "experiment",
      name,
      variable: { type: "random", draw: "random", options: [{ value: "t", label, color: "red" }] },
    });
    const items = [
      experiment("arm", "Misinformation"),
      experiment("frame", "Gain frame"),
      {
        type: "branch",
        label: "Screen-out",
        condition: { script: "true" },
        children: [question("q", { type: "confirm", question: "You got $var.frame.label" })],
        elseChildren: [{ type: "branch", label: "Inner", condition: { script: "true" }, children: [question("r")] }],
      },
      {
        type: "unit_loop",
        id: "loop_1",
        label: "Main",
        children: [
          { type: "layout", label: "With the full text", template: "$unit.text" },
          {
            type: "branch",
            label: "Only the treated",
            condition: { script: "true" },
            children: [{ type: "layout", label: "Short", template: "$unit.text" }, question("s")],
          },
        ],
      },
    ] as TopLevelItem[];
    const sent = toCoderItems(items);
    expect(JSON.stringify(sent)).not.toMatch(
      /Screen-out|Inner|With the full text|Only the treated|Short|Misinformation/,
    );
    expect(sent[0]).toEqual({
      type: "experiment",
      name: "arm",
      variable: { type: "random", options: [{ value: "t", color: "red" }] },
    });
    // Shown with $var.frame.label: the labels are part of what coders see
    expect(sent[1]).toEqual({
      type: "experiment",
      name: "frame",
      variable: { type: "random", options: [{ value: "t", label: "Gain frame", color: "red" }] },
    });
    // A loop's label is in the coder's navigation menu
    expect(sent[3]).toMatchObject({ type: "unit_loop", id: "loop_1", label: "Main" });
    expect(items[2]).toMatchObject({ label: "Screen-out" });
  });

  it("nominal values can be written in answer keys and exports: no ; | or new line, not like 3..5, at most 128", () => {
    const withValues = (...values: string[]) => [
      question("q", { type: "nominal", question: "?", options: values.map((value) => ({ value })) }),
    ];
    expect(messages(withValues("human_interest", "a.b", "3.5", "1-2", "a".repeat(128)))).toEqual([]);
    for (const value of ["a;b", "a|b", "a\nb", "3..5", "-1.5 ..2", "a".repeat(129)])
      expect([value, messages(withValues(value)).length]).toEqual([value, 1]);
    expect(messages(withValues("a;b"))[0]).toContain("has a ; or |");
    expect(messages(withValues("3..5"))[0]).toContain("starts like a range of numbers");
    const swipe = { type: "swipe", question: "?", options: [{ value: "a|b" }, { value: "c" }] };
    expect(messages([question("s", swipe)])).toHaveLength(1);
  });

  it("answer_ and feedback_ columns are the design's questions'", () => {
    const questions = new Set(["topic"]);
    expect(reservedColumnError("answer_topic", questions)).toBeNull();
    expect(reservedColumnError("feedback_topic", questions)).toBeNull();
    expect(reservedColumnError("answers", questions)).toBeNull();
    expect(reservedColumnError("text", questions)).toBeNull();
    expect(reservedColumnError("answer_text", questions)).toContain("reserved");
    expect(reservedColumnError("feedback_x", questions)).toContain("'x' is not a question of the design");
  });

  it("a key the design format doesn't know is an issue that names it, wherever it is", () => {
    const issues = (items: unknown[]) => validateDesignItems(items).map((i) => [i.path.join("."), i.message]);
    const multiple = { type: "nominal", question: "?", options: [{ value: "a" }], multipel: true };
    expect(issues([question("q", multiple)])).toEqual([["0.variable", 'Unrecognized key: "multipel"']]);
    expect(issues([{ ...question("q"), meta: { note: "x" } }])).toEqual([["0", 'Unrecognized key: "meta"']]);
    const unknown: [string, unknown[]][] = [
      ["option", [question("q", { ...nominal, options: [{ value: "a", colour: "red" }] })]],
      ["loop", [loop([question("q")], { ordr: "random" })]],
      ["loop units", [loop([question("q")], { units: { practise: "before" } })]],
      ["layout", [loop([question("q")], {}, { template: "", stile: {} })]],
      ["session", [session({ invit: {} }), question("q")]],
      ["invite", [session({ invite: { mode: "crowd", maxcoders: 3 } }), question("q")]],
      ["URL parameter", [session({ urlParams: [{ name: "p", patern: "x" }] }), question("q")]],
      [
        "end",
        [
          {
            type: "branch",
            condition: { script: "true" },
            children: [{ type: "end", name: "e", outcome: "complete", url: "x" }],
          },
        ],
      ],
      [
        "experiment",
        [
          {
            type: "experiment",
            name: "e",
            variable: { type: "random", draw: "random", options: [{ value: "a" }], wieght: 1 },
          },
        ],
      ],
    ];
    for (const [what, items] of unknown) {
      const found = issues(items).map(([, message]) => message);
      expect([what, found.filter((m) => m.startsWith("Unrecognized key")).length]).toEqual([what, 1]);
    }
    // A draft with such an issue is still a list of items (it can be saved)
    expect(DesignWriteSchema.safeParse({ items: [question("q", multiple)] }).success).toBe(true);
    expect(DesignItemsSchema.safeParse([question("q", multiple)]).success).toBe(false);
  });

  it("11. an unknown type names the types there are", () => {
    const issues = (items: unknown[]) => validateDesignItems(items).map((i) => [i.path.join("."), i.message]);
    expect(issues([{ type: "quesion", name: "q", variable: confirm }])).toEqual([
      ["0.type", "Unknown type 'quesion': use question, experiment, unit_loop, end, session or branch"],
    ]);
    expect(issues([loop([{ type: "text", name: "q" }])])).toEqual([
      ["0.children.1.type", "Unknown type 'text': use question, layout, end or branch"],
    ]);
    expect(issues([{ name: "q" }])[0]).toEqual([
      "0.type",
      "No type: use question, experiment, unit_loop, end, session or branch",
    ]);
    // An answer type: the schema's own message has them
    expect(issues([question("q", { type: "nominl", question: "?" })])[0][1]).toContain("'nominal' | 'ordinal'");
    expect(DesignItemsSchema.safeParse([{ type: "quesion" }]).success).toBe(false);
  });
});
