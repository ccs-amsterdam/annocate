import { describe, expect, it } from "vitest";
import type { AnyVariableType } from "./answers.js";
import {
  buildScope,
  extractReferences,
  outputText,
  parseTemplate,
  referenceOptions,
  referenceShape,
  referenceText,
  type TemplateExpression,
} from "./references.js";
import { fillUnitsetName, unitsetMatchesSource } from "./unitLoop.js";

const refs = (script: string) => extractReferences(script).references.map(referenceText);
const errors = (script: string) => extractReferences(script).errors.map((e) => e.message);
const expressions = (source: string) =>
  parseTemplate(source).segments.filter((s): s is TemplateExpression => s.type === "expression");

describe("extractReferences", () => {
  it("finds references, consuming only the reference's own segments", () => {
    expect(refs("$unit.text.length > 10 && $var.role.value === 'x' || $var.interest.items.tech.value >= 4")).toEqual([
      "$unit.text",
      "$var.role.value",
      "$var.interest.items.tech.value",
    ]);
    expect(refs("$var.topics.values.includes('a')")).toEqual(["$var.topics.values"]);
    expect(errors("$const.intro")).toEqual(["Constants are now snippets: use $snippet.<name> in the template"]);
  });

  it("reads helper calls", () => {
    const { references } = extractReferences(`$var.topics.has("a") && $var.q.items.tech.gte(3)`);
    expect(references.map((r) => [referenceText(r), r.call])).toEqual([
      ["$var.topics.has", true],
      ["$var.q.items.tech.gte", true],
    ]);
    expect(errors("$var.topics.has")).toEqual(["$var.topics.has is a method: call it, $var.topics.has(...)"]);
  });

  it("skips string literals and comments, but not template literal substitutions", () => {
    expect(refs(`'$var.a.value' + "$unit.b" // $var.c.value\n/* $const.d */ + $unit.e`)).toEqual(["$unit.e"]);
    expect(refs("`$unit.a ${$unit.b + `${$var.c.value}`}`")).toEqual(["$unit.b", "$var.c.value"]);
  });

  it("reports computed and bare namespaces", () => {
    expect(errors("$var[name].value")).toEqual(["Names after $var must be literal ($var.name), not computed ($var[...])"]);
    expect(errors("Object.keys($unit)")).toEqual(["$unit must be followed by a name ($unit.name)"]);
    expect(errors("$var.q[x]")).toHaveLength(1);
    expect(errors("$unit.x['y']")).toEqual(["Names in $unit.x[...] must be literal, not computed"]);
    expect(errors("$var.q.items")).toHaveLength(1);
    expect(errors("$var.q.code")).toEqual([
      "$var.q.code: unknown property (.code is now .value, or .values for several answers); use .value, .label, .values, .labels, .texts, .answered, .items or a method",
    ]);
  });

  it("ignores identifiers that merely contain the namespace", () => {
    expect(refs("a$var.x.value + obj.$unit.y + $variable + $units")).toEqual([]);
  });
});

describe("parseTemplate", () => {
  it("splits text and expressions, with suffixes and the alone-on-line flag", () => {
    const parsed = parseTemplate("# $unit.headline\n\n$unit.body::markdown\n\nScore: {{ $unit.a + 1 }}::text.");
    expect(parsed.errors).toEqual([]);
    expect(parsed.segments.map((s) => (s.type === "text" ? s.text : `[${s.script}|${s.suffix}|${s.alone}]`)).join("")).toBe(
      "# [$unit.headline|text|false]\n\n[$unit.body|markdown|true]\n\nScore: [$unit.a + 1|text|false].",
    );
  });

  it("treats a bare $ref as the one-reference script", () => {
    const [bare] = expressions("$unit.text::markdown");
    const [braced] = expressions("{{$unit.text}}::markdown");
    expect(bare.script).toBe(braced.script);
    expect(bare.suffix).toBe(braced.suffix);
    expect(bare.ref).toBeDefined();
    expect(braced.ref).toBeUndefined();
  });

  it("leaves escaped refs and refs in code spans and fences literal", () => {
    expect(expressions("\\$unit.a `$unit.b` ``x $unit.c``\n```\n$unit.d {{ x }}\n```\n$unit.e")).toHaveLength(1);
    expect(parseTemplate("cost: \\$unit.price").segments).toEqual([{ type: "text", text: "cost: \\$unit.price" }]);
  });

  it("reports unknown suffixes and unclosed blocks", () => {
    expect(parseTemplate("$unit.a::bold").errors.map((e) => e.message)).toEqual([
      "Unknown output '::bold' (use ::text, ::markdown, ::image or ::html)",
    ]);
    expect(parseTemplate("{{ 1 + ").errors.map((e) => e.message)).toEqual(["Unclosed {{"]);
  });

  it("finds refs glued to text, and leaves trailing punctuation", () => {
    expect(expressions("part_$var.slot.value").map((e) => e.script)).toEqual(["$var.slot.value"]);
    expect(expressions("You are a $var.role.label.").map((e) => e.script)).toEqual(["$var.role.label"]);
    expect(parseTemplate(`$var.role.is("a")`).errors.map((e) => e.message)).toEqual(['$var.role.is(...) can only be used inside {{ }}']);
  });
});

const questions = new Map<string, AnyVariableType>([
  ["role", { type: "nominal", question: "?", options: [{ value: "student", label: "Student" }, { value: "staff" }] }],
  ["topics", { type: "nominal", question: "?", multiple: true, options: [{ value: "x" }, { value: "y" }] }],
  ["edu", { type: "ordinal", question: "?", options: [{ value: 1, label: "low" }, { value: 2, label: "high" }] }],
  ["interest", { type: "scale", question: "?", options: [{ value: 1, label: "low" }, { value: 5, label: "high" }], items: [{ name: "tech" }] }],
  ["age", { type: "numeric", question: "?", labels: [{ value: 18, label: "adult" }] }],
  ["ok", { type: "confirm", question: "?" }],
  ["slot", { type: "auto", source: "invite", options: [{ value: "1" }] }],
  ["ents", { type: "span", question: "?", column: "text", options: [{ value: "PER", label: "Person" }] }],
]);

describe("referenceShape", () => {
  const shape = (ref: string) => {
    const { references, errors } = extractReferences(ref);
    if (errors.length) throw new Error(errors[0].message);
    return referenceShape(questions, references[0]);
  };

  it("follows from the codebook", () => {
    expect(shape("$var.role.value")).toMatchObject({ ok: true, array: false, type: "string", values: ["student", "staff"] });
    expect(shape("$var.role.label")).toMatchObject({ ok: true, array: false, type: "string" });
    expect(shape("$var.edu.value")).toMatchObject({ ok: true, array: false, type: "number", values: [1, 2] });
    expect(shape("$var.topics.values")).toMatchObject({ ok: true, array: true });
    expect(shape("$var.interest.values")).toMatchObject({ ok: true, array: true, type: "number" });
    expect(shape("$var.interest.items.tech.value")).toMatchObject({ ok: true, array: false, type: "number" });
    expect(shape("$var.age.value")).toMatchObject({ ok: true, type: "number" });
    expect(shape("$var.ok.answered")).toMatchObject({ ok: true, type: "boolean" });
    expect(shape("$var.slot.value")).toMatchObject({ ok: true, values: ["1"] });
    expect(shape("$var.ents.texts")).toMatchObject({ ok: true, array: true, type: "string" });
    expect(shape("$unit.anything")).toMatchObject({ ok: true, type: "any" });
  });

  it("knows the helper methods per kind", () => {
    expect(shape("$var.role.is('x')")).toMatchObject({ ok: true, type: "boolean", method: { name: "is", kind: "single" } });
    expect(shape("$var.edu.gte(1)")).toMatchObject({ ok: true, method: { name: "gte", kind: "ordinal" } });
    expect(shape("$var.topics.count()")).toMatchObject({ ok: true, type: "number" });
    expect(shape("$var.interest.items.tech.lt(3)")).toMatchObject({ ok: true, method: { kind: "ordinal" } });
    expect(shape("$var.role.gte(1)")).toEqual({ ok: false, reason: `"role" is a nominal question, which does not support "greater than or equal to" comparisons; use "is" or "is one of"` });
    expect(shape("$var.topics.is('x')").ok).toBe(false);
    expect(shape("$var.interest.is(1)").ok).toBe(false);
  });

  it("rejects properties that don't fit", () => {
    expect(shape("$var.ok.value").ok).toBe(false);
    expect(shape("$var.interest.value").ok).toBe(false);
    expect(shape("$var.interest.items.food.value").ok).toBe(false);
    expect(shape("$var.role.items.x.value").ok).toBe(false);
    expect(shape("$var.ents.value").ok).toBe(false);
    expect(shape("$var.topics.value")).toEqual({
      ok: false,
      reason: `$var.topics.value: "topics" is a nominal question with multiple answers, which has no .value; use .values, .labels or .answered`,
    });
    expect(shape("$var.nope.value").ok).toBe(false);
  });
});

describe("referenceOptions", () => {
  it("lists the references that fit each question", () => {
    const refs = referenceOptions([...questions].map(([name, variable]) => ({ name, variable }))).map((o) => o.ref);
    expect(refs).toEqual([
      "$var.role.value",
      "$var.role.label",
      "$var.role.answered",
      "$var.topics.values",
      "$var.topics.labels",
      "$var.topics.answered",
      "$var.edu.value",
      "$var.edu.label",
      "$var.edu.answered",
      "$var.interest.values",
      "$var.interest.items.tech.value",
      "$var.interest.items.tech.label",
      "$var.interest.answered",
      "$var.age.value",
      "$var.age.label",
      "$var.age.answered",
      "$var.ok.answered",
      "$var.slot.value",
      "$var.slot.label",
      "$var.slot.answered",
      "$var.ents.values",
      "$var.ents.labels",
      "$var.ents.texts",
      "$var.ents.answered",
    ]);
  });
});

describe("buildScope", () => {
  it("has every question, null or [] when unanswered", () => {
    const scope = buildScope(questions, {});
    expect(scope.$var.role).toEqual({ answered: false, value: null, label: null });
    expect(scope.$var.topics).toEqual({ answered: false, values: [], labels: [] });
    expect(scope.$var.interest).toEqual({ answered: false, values: [], items: { tech: { value: null, label: null } } });
    expect(scope.$var.ok).toEqual({ answered: false });
    expect(scope.$var.ents).toEqual({ answered: false, values: [], labels: [], texts: [] });
    expect(scope.$unit).toEqual({});
  });

  it("fills in answers with their labels", () => {
    const scope = buildScope(
      questions,
      {
        role: { done: true, skip: false, values: [{ value: "student" }] },
        topics: { done: true, skip: false, values: [{ value: "x" }, { value: "y" }] },
        interest: { done: true, skip: false, values: [{ item: "tech", value: 5 }] },
        age: { done: true, skip: false, values: [{ value: 18 }] },
        ok: { done: true, skip: false },
        ents: { done: true, skip: false, spans: [{ id: "1", field: "text", value: "PER", slices: [{ offset: 0, length: 3, text: "Ann" }] }] },
        slot: { done: true, skip: true, values: [{ value: "1" }] },
      },
      { text: "Ann" },
    );
    expect(scope.$var.role).toEqual({ answered: true, value: "student", label: "Student" });
    expect(scope.$var.topics.values).toEqual(["x", "y"]);
    expect(scope.$var.interest).toEqual({ answered: true, values: [5], items: { tech: { value: 5, label: "high" } } });
    expect(scope.$var.age).toEqual({ answered: true, value: 18, label: "adult" });
    expect(scope.$var.ok.answered).toBe(true);
    expect(scope.$var.ents).toEqual({ answered: true, values: ["PER"], labels: ["Person"], texts: ["Ann"] });
    expect(scope.$var.slot).toEqual({ answered: false, value: null, label: null });
    expect(scope.$unit.text).toBe("Ann");
  });
});

describe("outputText", () => {
  it("converts values predictably", () => {
    expect(outputText("a")).toBe("a");
    expect(outputText(3)).toBe("3");
    expect(outputText(["a", 2])).toBe("a, 2");
    expect(outputText(null)).toBe("");
    expect(outputText(undefined)).toBe("");
    expect(outputText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("unitset names", () => {
  it("fills in references and matches names against sources", () => {
    const scope = buildScope(questions, { slot: { done: true, skip: false, values: [{ value: "1" }] } });
    expect(fillUnitsetName("part_$var.slot.value", scope)).toBe("part_1");
    expect(fillUnitsetName("part_$var.role.value", scope)).toBeNull();
    expect(unitsetMatchesSource("part_$var.slot.value", "part_1")).toBe(true);
    expect(unitsetMatchesSource("part_$var.slot.value", "other_1")).toBe(false);
    expect(unitsetMatchesSource("a.b", "axb")).toBe(false);
  });
});
