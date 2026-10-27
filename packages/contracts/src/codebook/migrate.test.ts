import { describe, expect, it } from "vitest";
import { CodebookItemsSchema } from "./codebook.js";
import { migrateCodebookItems } from "./migrate.js";

const q = (name: string, variable: object) => ({ type: "question", name, variable });

describe("migrateCodebookItems", () => {
  it("migrates the old question types to options", () => {
    const old = [
      q("role", { type: "select_code", question: "?", vertical: true, codes: [{ code: "a", value: 7, color: "red" }, { code: "b" }] }),
      q("topic", { type: "search_code", question: "?", multiple: true, codes: [{ code: "x" }] }),
      q("agree", { type: "scale", question: "?", codes: [{ code: "no", value: 3 }, { code: "yes", value: 1 }] }),
      q("battery", { type: "scale", question: "?", items: [{ name: "tech" }], codes: [{ code: "low", value: 0 }, { code: "high", value: 4 }] }),
      q("slot", { type: "auto", source: "random", options: [{ code: "1", weight: 2 }] }),
      q("swipe", { type: "annotinder", question: "?", codes: [{ code: "no" }, { code: "yes" }] }),
    ];
    const items = CodebookItemsSchema.parse(old) as { variable: unknown }[];
    expect(items.map((i) => i.variable)).toEqual([
      { type: "nominal", question: "?", layout: "grid", columns: 1, options: [{ value: "a", color: "red" }, { value: "b" }] },
      { type: "nominal", question: "?", multiple: true, layout: "dropdown", options: [{ value: "x" }] },
      { type: "ordinal", question: "?", options: [{ value: 1, label: "no" }, { value: 2, label: "yes" }] },
      { type: "scale", question: "?", items: [{ name: "tech" }], options: [{ value: 0, label: "low" }, { value: 4, label: "high" }] },
      { type: "auto", source: "random", options: [{ value: "1", weight: 2 }] },
      { type: "annotinder", question: "?", options: [{ value: "no" }, { value: "yes" }] },
    ]);
  });

  it("splits the categorical type of 2026-10-26 by its level", () => {
    const old = [
      q("a", { type: "categorical", question: "?", options: [{ value: "x" }] }),
      q("b", { type: "categorical", level: "ordinal", question: "?", options: [{ value: 1 }] }),
    ];
    expect((CodebookItemsSchema.parse(old) as { variable: unknown }[]).map((i) => i.variable)).toEqual([
      { type: "nominal", question: "?", options: [{ value: "x" }] },
      { type: "ordinal", question: "?", options: [{ value: 1 }] },
    ]);
  });

  it("drops screenOut", () => {
    const [item] = migrateCodebookItems([q("a", { type: "select_code", question: "?", codes: [{ code: "x", screenOut: true }] })]) as {
      variable: { options: unknown[] };
    }[];
    expect(item.variable.options).toEqual([{ value: "x" }]);
  });

  it("turns rules into simple scripts where it can", () => {
    const old = [
      q("role", { type: "select_code", question: "?", codes: [{ code: "a" }, { code: "b" }] }),
      q("topics", { type: "select_code", question: "?", multiple: true, codes: [{ code: "x" }, { code: "y" }] }),
      q("edu", { type: "scale", question: "?", codes: [{ code: "low", value: 1 }, { code: "high", value: 2 }] }),
      q("battery", { type: "scale", question: "?", items: [{ name: "tech" }], codes: [{ code: "low", value: 1 }, { code: "high", value: 5 }] }),
      {
        type: "condition",
        name: "c",
        condition: {
          match: "any",
          rules: [
            { ref: "$var.role.code", op: "isnot", value: "a" },
            { ref: "$var.topics.code", op: "is", value: ["x", "y"] },
            { ref: "$var.edu.code", op: "is", value: "high" },
            { ref: "$var.edu.value", op: "gte", value: 2 },
            { ref: "$var.battery.tech.value", op: "lt", value: 3 },
            { ref: "$var.role.answered", op: "is", value: false },
          ],
        },
        children: [q("x", { type: "confirm", question: "?" })],
      },
      { type: "condition", name: "d", condition: { rules: [{ ref: "$unit.source", op: "is", value: "nyt" }] }, children: [q("y", { type: "confirm", question: "?" })] },
      { type: "condition", name: "e", condition: { rules: [] }, children: [q("z", { type: "confirm", question: "?" })] },
    ];
    const items = migrateCodebookItems(old) as { condition?: { script: string } }[];
    expect(items[4].condition!.script).toBe(
      `!$var.role.is("a") || $var.topics.hasAny("x", "y") || $var.edu.is(2) || $var.edu.gte(2) || $var.battery.items.tech.lt(3) || !$var.role.answered`,
    );
    expect(items[5].condition!.script).toBe(`$unit.source === "nyt"`);
    expect(items[6].condition!.script).toBe("true");
    // Conditions lost their name.
    expect(items.filter((i) => "name" in i && (i as { type?: string }).type === "condition")).toEqual([]);
  });

  it("migrates branch conditions in legacy-shaped loops too", () => {
    const old = [
      q("slot", { type: "auto", source: "invite", options: [{ code: "1" }] }),
      {
        type: "unit_loop",
        name: "l",
        units: [{ when: { rules: [{ ref: "$var.slot.code", op: "is", value: "1" }] }, sources: [{ unitset: "a" }] }],
        layout: { template: "" },
        children: [q("x", { type: "confirm", question: "?" })],
      },
    ];
    const items = CodebookItemsSchema.parse(old) as { units?: { when?: { script: string } }[] }[];
    expect(items[1].units![0].when).toEqual({ script: `$var.slot.is("1")` });
  });
});
