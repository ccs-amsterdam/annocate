import { describe, expect, it } from "vitest";
import { validateDesignItems } from "@annotinder/contracts";
import { keepFields, parseSimpleLayout, placeField, placedFields, removeField, simpleTemplate } from "./simpleLayout";

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
    const loop = { type: "unit_loop", units: [{ mode: "all" }], layout: { template }, children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }] };
    expect(validateDesignItems([loop])).toEqual([]);
  });

  it("leave templates with anything else to the template editor", () => {
    expect(parseSimpleLayout("## $unit.headline")).toBeNull();
    expect(parseSimpleLayout("$unit.text\n\n# $unit.headline")).toBeNull();
    expect(parseSimpleLayout("Read this: $unit.text")).toBeNull();
    expect(parseSimpleLayout("::: text\n$unit.text\n:::")).toBeNull();
  });

  it("place a field: one in the title or byline (replacing), any number in the body, taken from where it was", () => {
    let layout = placeField({ body: [] }, "headline", "title");
    expect(layout).toEqual({ title: "headline", body: [] });
    layout = placeField(layout, "source", "title");
    expect(layout).toEqual({ title: "source", body: [] });
    layout = placeField(placeField(layout, "text", "body"), "notes", "body");
    expect(layout.body).toEqual(["text", "notes"]);
    // From the body to the byline, and before another body field
    layout = placeField(layout, "notes", "byline");
    expect(layout).toEqual({ title: "source", byline: "notes", body: ["text"] });
    layout = placeField(layout, "headline", "body", 0);
    expect(layout.body).toEqual(["headline", "text"]);
    // Moving down in the body: before the field at `at`, as the body is now
    expect(placeField({ body: ["a", "b", "c"] }, "a", "body", 2).body).toEqual(["b", "a", "c"]);
    expect(placedFields(layout)).toEqual(["source", "notes", "headline", "text"]);
  });

  it("remove a field, and keep only fields that exist", () => {
    const layout = { title: "headline", byline: "source", body: ["text", "notes"] };
    expect(removeField(layout, "source")).toEqual({ title: "headline", body: ["text", "notes"] });
    expect(removeField(layout, "notes")).toEqual({ title: "headline", byline: "source", body: ["text"] });
    expect(keepFields(layout, ["text", "source"])).toEqual({ byline: "source", body: ["text"] });
  });
});
