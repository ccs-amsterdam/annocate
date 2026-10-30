import { describe, expect, it } from "vitest";
import { validateCodebookItems } from "@annotinder/contracts";
import { guessSimpleLayout, parseSimpleLayout, simpleTemplate } from "./simpleLayout";

describe("simple layouts", () => {
  it("write a template and read it back", () => {
    const layout = { title: "headline", byline: "source", body: ["lead", "text"] };
    const template = simpleTemplate(layout);
    expect(template).toBe("# $unit.headline\n\n*$unit.source*\n\n$unit.lead\n\n$unit.text");
    expect(parseSimpleLayout(template)).toEqual(layout);
    expect(parseSimpleLayout("")).toEqual({ body: [] });
    expect(parseSimpleLayout("$unit.text")).toEqual({ body: ["text"] });
  });

  it("are a valid layout", () => {
    const template = simpleTemplate({ title: "headline", byline: "source", body: ["text"] });
    const loop = { type: "unit_loop", units: [{ mode: "all", unitset: "__all__" }], layout: { template }, children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }] };
    expect(validateCodebookItems([loop])).toEqual([]);
  });

  it("leave templates with anything else to the template editor", () => {
    expect(parseSimpleLayout("## $unit.headline")).toBeNull();
    expect(parseSimpleLayout("$unit.text\n\n# $unit.headline")).toBeNull();
    expect(parseSimpleLayout("Read this: $unit.text")).toBeNull();
    expect(parseSimpleLayout("::: text\n$unit.text\n:::")).toBeNull();
  });

  it("guess the title and byline by name", () => {
    expect(guessSimpleLayout(["headline", "source", "text"])).toEqual({ title: "headline", byline: "source", body: ["text"] });
    expect(guessSimpleLayout(["text", "notes"])).toEqual({ body: ["text", "notes"] });
  });
});
