import { describe, expect, it } from "vitest";
import type { AnyVariableType } from "./answers.js";
import {
  buildScope,
  extractReferences,
  outputText,
  parseReference,
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
    expect(refs("$unit.text.length > 10 && $var.role.code === 'x' || $var.interest.tech.value >= 4")).toEqual([
      "$unit.text",
      "$var.role.code",
      "$var.interest.tech.value",
    ]);
    expect(refs("$var.topics.code.includes('a') && $const.intro")).toEqual(["$var.topics.code", "$const.intro"]);
  });

  it("skips string literals and comments, but not template literal substitutions", () => {
    expect(refs(`'$var.a.code' + "$unit.b" // $var.c.code\n/* $const.d */ + $unit.e`)).toEqual(["$unit.e"]);
    expect(refs("`$unit.a ${$unit.b + `${$var.c.code}`}`")).toEqual(["$unit.b", "$var.c.code"]);
  });

  it("reports computed and bare namespaces", () => {
    expect(errors("$var[name].code")).toEqual(["Names after $var must be literal ($var.name), not computed ($var[...])"]);
    expect(errors("Object.keys($unit)")).toEqual(["$unit must be followed by a name ($unit.name)"]);
    expect(errors("$var.q[x]")).toEqual(["$var.q needs a property: .code, .value, .text or .answered"]);
    expect(errors("$unit.x['y']")).toEqual(["Names in $unit.x[...] must be literal, not computed"]);
    expect(errors("$var.q.item")).toHaveLength(1);
  });

  it("ignores identifiers that merely contain the namespace", () => {
    expect(refs("a$var.x.code + obj.$unit.y + $variable + $units")).toEqual([]);
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
      "Unknown output '::bold' (use ::text, ::markdown, ::image or ::tokenize)",
    ]);
    expect(parseTemplate("{{ 1 + ").errors.map((e) => e.message)).toEqual(["Unclosed {{"]);
  });

  it("finds refs glued to text, and leaves trailing punctuation", () => {
    expect(expressions("part_$var.slot.code").map((e) => e.script)).toEqual(["$var.slot.code"]);
    expect(expressions("You are a $var.role.code.").map((e) => e.script)).toEqual(["$var.role.code"]);
  });
});

const questions = new Map<string, AnyVariableType>([
  ["role", { type: "select_code", question: "?", codes: [{ code: "a", value: 1 }, { code: "b", value: 2 }] }],
  ["topics", { type: "select_code", question: "?", multiple: true, codes: [{ code: "x" }, { code: "y" }] }],
  ["interest", { type: "scale", question: "?", codes: [{ code: "low", value: 1 }, { code: "high", value: 5 }], items: [{ name: "tech" }] }],
  ["ok", { type: "confirm", question: "?" }],
  ["slot", { type: "auto", source: "invite", options: [{ code: "1" }] }],
  ["ents", { type: "span", question: "?", column: "text", codes: [{ code: "PER" }] }],
]);

describe("referenceShape", () => {
  const shape = (ref: string) => {
    const parsed = parseReference(ref);
    if ("error" in parsed) throw new Error(parsed.error);
    return referenceShape(questions, parsed.ref);
  };

  it("follows from the codebook", () => {
    expect(shape("$var.role.code")).toMatchObject({ ok: true, array: false, type: "string", codes: ["a", "b"] });
    expect(shape("$var.role.value")).toMatchObject({ ok: true, array: false, type: "number" });
    expect(shape("$var.topics.code")).toMatchObject({ ok: true, array: true });
    expect(shape("$var.interest.tech.value")).toMatchObject({ ok: true, array: false, type: "number" });
    expect(shape("$var.ok.answered")).toMatchObject({ ok: true, type: "boolean" });
    expect(shape("$var.slot.code")).toMatchObject({ ok: true, codes: ["1"] });
    expect(shape("$var.ents.text")).toMatchObject({ ok: true, array: true, type: "string" });
    expect(shape("$unit.anything")).toMatchObject({ ok: true, type: "any" });
  });

  it("rejects properties that don't fit", () => {
    expect(shape("$var.ok.code").ok).toBe(false);
    expect(shape("$var.interest.code").ok).toBe(false);
    expect(shape("$var.ents.value").ok).toBe(false);
    expect(shape("$var.nope.code").ok).toBe(false);
    expect(shape("$var.topics.value")).toMatchObject({ ok: true, warning: expect.stringContaining("no values") });
  });
});

describe("referenceOptions", () => {
  it("lists the references that fit each question", () => {
    const refs = referenceOptions([...questions].map(([name, variable]) => ({ name, variable }))).map((o) => o.ref);
    expect(refs).toEqual([
      "$var.role.code",
      "$var.role.value",
      "$var.role.answered",
      "$var.topics.code",
      "$var.topics.answered",
      "$var.interest.tech.code",
      "$var.interest.tech.value",
      "$var.interest.answered",
      "$var.ok.answered",
      "$var.slot.code",
      "$var.slot.answered",
      "$var.ents.code",
      "$var.ents.text",
      "$var.ents.answered",
    ]);
  });
});

describe("buildScope", () => {
  it("has every question, null or [] when unanswered", () => {
    const scope = buildScope(questions, {});
    expect(scope.$var.role).toEqual({ answered: false, code: null, value: null });
    expect(scope.$var.topics).toEqual({ answered: false, code: [], value: [] });
    expect(scope.$var.interest).toEqual({ answered: false, tech: { code: null, value: null } });
    expect(scope.$var.ok).toEqual({ answered: false });
    expect(scope.$var.ents).toEqual({ answered: false, code: [], text: [] });
    expect(scope.$unit).toEqual({});
  });

  it("fills in answers, taking values from the codebook when the answer has none", () => {
    const scope = buildScope(
      questions,
      {
        role: { done: true, skip: false, codes: [{ code: "b" }] },
        topics: { done: true, skip: false, codes: [{ code: "x" }, { code: "y" }] },
        interest: { done: true, skip: false, codes: [{ item: "tech", code: "high", value: 5 }] },
        ok: { done: true, skip: false },
        ents: { done: true, skip: false, spans: [{ id: "1", field: "text", code: "PER", slices: [{ offset: 0, length: 3, text: "Ann" }] }] },
        slot: { done: true, skip: true, codes: [{ code: "1" }] },
      },
      { text: "Ann" },
      { intro: "hi" },
    );
    expect(scope.$var.role).toEqual({ answered: true, code: "b", value: 2 });
    expect(scope.$var.topics.code).toEqual(["x", "y"]);
    expect(scope.$var.interest.tech).toEqual({ code: "high", value: 5 });
    expect(scope.$var.ok.answered).toBe(true);
    expect(scope.$var.ents).toEqual({ answered: true, code: ["PER"], text: ["Ann"] });
    expect(scope.$var.slot).toEqual({ answered: false, code: null, value: null });
    expect(scope.$unit.text).toBe("Ann");
    expect(scope.$const.intro).toBe("hi");
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
    const scope = buildScope(questions, { slot: { done: true, skip: false, codes: [{ code: "1" }] } });
    expect(fillUnitsetName("part_$var.slot.code", scope)).toBe("part_1");
    expect(fillUnitsetName("part_$var.role.code", scope)).toBeNull();
    expect(unitsetMatchesSource("part_$var.slot.code", "part_1")).toBe(true);
    expect(unitsetMatchesSource("part_$var.slot.code", "other_1")).toBe(false);
    expect(unitsetMatchesSource("a.b", "axb")).toBe(false);
  });
});
