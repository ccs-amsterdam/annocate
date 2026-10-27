import { describe, expect, it } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import { ExpressionCache } from "./expressionCache";
import { prepareTemplate, renderTemplate, staticTemplate } from "./renderTemplate";

const scope = (unit: Record<string, unknown>): ReferenceScope => ({
  $unit: unit,
  $var: { role: { answered: true, value: "student", label: "Student" }, topics: { answered: true, values: ["a", "b"], labels: ["A", "B"] } },
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
      "# $unit.headline: {{ $unit.n * 2 }}, $var.role.label, $var.topics.values, {{ null }}",
      scope({ headline: "Hi", n: 21 }),
    );
    expect(rendered.values.map((v) => v.text)).toEqual(["Hi", "42", "Student", "a, b", ""]);
  });

  it("treats $ref and {{$ref}} the same", async () => {
    const s = scope({ text: "**x**" });
    const bare = await renderTemplate("$unit.text::markdown", s);
    const braced = await renderTemplate("{{$unit.text}}::markdown", s);
    expect(bare).toEqual(braced);
  });

  it("marks the fields span questions select in as selectable", async () => {
    const rendered = await renderTemplate("$unit.body\n\n$unit.title", scope({ body: "a b", title: "T" }), undefined, "t", {
      selectable: ["body"],
    });
    expect(rendered.values).toEqual([
      { suffix: "text", text: "a b", block: true, field: "body", selectable: true },
      { suffix: "text", text: "T", block: true, field: "title" },
    ]);
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

describe("renderTemplate blocks", () => {
  const strip = (markdown: string) => markdown.replace(/\uE000\d+\uE001/g, "#").replace(/\s+/g, " ").trim();

  it("shows the first if branch whose condition holds, else the else", async () => {
    const template = "::: if $var.role.is('teacher')\nT\n::: else if $var.role.is('student')\nS $unit.a\n::: else\nE\n:::\nend";
    const rendered = await renderTemplate(template, scope({ a: "x" }));
    expect(strip(rendered.markdown)).toBe("S # end");
    expect(rendered.values.map((v) => v.text)).toEqual(["x"]);
  });

  it("shows the last from stage whose question is reached", async () => {
    const template = "top\n::: from b\nB\n::: from c\nC\n:::";
    const at = (current: string) => renderTemplate(template, scope({}), undefined, "t", { progress: { current, order: ["a", "b", "c"] } });
    expect(strip((await at("a")).markdown)).toBe("top");
    expect(strip((await at("b")).markdown)).toBe("top B");
    expect(strip((await at("c")).markdown)).toBe("top C");
    expect(strip((await renderTemplate(template, scope({}))).markdown)).toBe("top");
  });

  it("puts style blocks between marker paragraphs, with their styles", async () => {
    const rendered = await renderTemplate("::: style color: red; font-weight: bold\nHi\n:::", scope({}));
    expect(rendered.styles).toEqual([{ color: "red", fontWeight: "bold" }]);
    expect(rendered.markdown).toContain("\uE0100\uE011\n\nHi\n");
    expect(rendered.markdown).toContain("\uE012");
  });
});

describe("renderTemplate snippets", () => {
  it("puts snippets in as if typed: markdown, blocks and values all work", async () => {
    const snippets = { banner: "::: if $var.role.is('student')\n**Hi** $unit.name\n:::", outer: "$snippet.banner\nmore" };
    const rendered = await renderTemplate("$snippet.outer", scope({ name: "Ann" }), undefined, "t", { snippets });
    expect(rendered.markdown.replace(/\uE000\d+\uE001/g, "#").trim()).toBe("**Hi** #\nmore");
    expect(rendered.values.map((v) => v.text)).toEqual(["Ann"]);
  });
});

describe("staticTemplate", () => {
  it("shows each value's source", () => {
    expect(staticTemplate("Hi $var.role.value").values.map((v) => v.text)).toEqual(["$var.role.value"]);
  });
});
