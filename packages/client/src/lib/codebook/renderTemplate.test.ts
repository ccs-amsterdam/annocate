import { describe, expect, it } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import { ExpressionCache } from "./expressionCache";
import { prepareTemplate, renderTemplate, staticTemplate } from "./renderTemplate";

const scope = (unit: Record<string, unknown>, constants: Record<string, unknown> = {}): ReferenceScope => ({
  $unit: unit,
  $var: { role: { answered: true, code: "student", value: 1 }, topics: { answered: true, code: ["a", "b"] } },
  $const: constants,
});

describe("prepareTemplate", () => {
  it("replaces values with placeholders, giving values alone on a line their own block", () => {
    const { markdown, expressions } = prepareTemplate("# $unit.headline\nintro\n$unit.text::markdown\nmore");
    expect(markdown).toBe("# 0\nintro\n\n1\n\nmore");
    expect(expressions.map((e) => [e.script, e.suffix, e.alone])).toEqual([
      ["$unit.headline", "text", false],
      ["$unit.text", "markdown", true],
    ]);
  });

  it("leaves refs in code spans and escaped refs alone", () => {
    expect(prepareTemplate("`$unit.a` \\$unit.b").expressions).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("evaluates refs and {{ }} against the scope", async () => {
    const rendered = await renderTemplate(
      "# $unit.headline: {{ $unit.n * 2 }}, $var.role.code, $var.topics.code, $const.intro, {{ null }}",
      scope({ headline: "Hi", n: 21 }, { intro: "welcome" }),
    );
    expect(rendered.values.map((v) => v.text)).toEqual(["Hi", "42", "student", "a, b", "welcome", ""]);
  });

  it("treats $ref and {{$ref}} the same", async () => {
    const s = scope({ text: "**x**" });
    const bare = await renderTemplate("$unit.text::markdown", s);
    const braced = await renderTemplate("{{$unit.text}}::markdown", s);
    expect(bare).toEqual(braced);
  });

  it("names the field of a ::tokenize value", async () => {
    const rendered = await renderTemplate("$unit.body::tokenize", scope({ body: "a b" }));
    expect(rendered.values).toEqual([{ suffix: "tokenize", text: "a b", name: "body", block: true }]);
  });

  it("uses an ExpressionCache, still returning correct results", async () => {
    const cache = new ExpressionCache();
    const text = async (n: number) => (await renderTemplate("{{ $unit.n + 1 }}", scope({ n }), cache)).values[0].text;
    expect(await text(1)).toBe("2");
    expect(await text(1)).toBe("2");
    expect(await text(5)).toBe("6");
  });

  it("renders null (an empty number or boolean cell) as nothing", async () => {
    const rendered = await renderTemplate("n={{$unit.count}};$unit.count.", scope({ count: null }));
    expect(rendered.values.map((v) => v.text)).toEqual(["", ""]);
  });
});

describe("staticTemplate", () => {
  it("shows each value's source", () => {
    expect(staticTemplate("Hi $var.role.code").values.map((v) => v.text)).toEqual(["$var.role.code"]);
  });
});
