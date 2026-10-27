import { describe, expect, it } from "vitest";
import { CodebookItemsSchema } from "./codebook.js";
import { migrateCodebookItems } from "./migrate.js";
import { branchFingerprint, migrateLegacyUnitLoop } from "./unitLoop.js";
import { loopTitle, unitLoops } from "./item.js";

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

  it("migrates loops with sources to modes", () => {
    const loop = (units: unknown[], extra: object = {}) =>
      migrateLegacyUnitLoop({ type: "unit_loop", name: "l", units, layout: { template: "" }, children: [], ...extra }) as { units: unknown[] };
    const dynamic = { unitset: "pool", dynamic: { minCoders: 2, maxCoders: 3, priority: "saturate" } };
    expect(loop([{ sources: [{ unitset: "a" }] }]).units).toEqual([{ mode: "all", unitset: "a" }]);
    expect(loop([{ when: { script: "true" }, sources: [{ unitset: "overlap" }, dynamic] }], { maxUnits: 20 }).units).toEqual([
      {
        when: { script: "true" },
        mode: "shared",
        unitset: "pool",
        until: { coders: 2 },
        maxCoders: 3,
        priority: "saturate",
        maxUnits: 20,
        overlap: { unitset: "overlap", placement: "before" },
      },
    ]);
    const agree = { unitset: "pool", dynamic: { maxCoders: 3, agreement: { variable: "q", minAgree: 2 } } };
    expect(loop([{ sources: [agree] }]).units).toEqual([{ mode: "shared", unitset: "pool", until: { agree: 2, on: "q" }, maxCoders: 3 }]);
    // Two fixed sources, mixed: the second is the overlap, spread through the first.
    expect(loop([{ sources: [{ unitset: "part_$var.p.value" }, { unitset: "o" }] }], { order: "random" }).units).toEqual([
      { mode: "all", unitset: "part_$var.p.value", overlap: { unitset: "o", placement: "spread" } },
    ]);
    // Current branches are left alone.
    expect(loop([{ mode: "invitation" }]).units).toEqual([{ mode: "invitation" }]);
  });
});

describe("unit loop identity", () => {
  it("turns a loop's name into its label, keys loops by position, and fingerprints branches by what they hand out", () => {
    const loop = migrateLegacyUnitLoop({ type: "unit_loop", name: "main", units: [{ mode: "all", unitset: "a" }] }) as Record<string, unknown>;
    expect(loop.label).toBe("main");
    expect(loop).not.toHaveProperty("name");

    const items = [
      { type: "unit_loop", units: [] },
      { type: "condition", children: [{ type: "unit_loop", label: "second", units: [] }] },
    ];
    expect(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)])).toEqual([
      ["1", "Unit loop 1"],
      ["2", "second"],
    ]);

    const a = branchFingerprint({ mode: "sets", unitsets: ["s1", "s2"] });
    expect(branchFingerprint({ mode: "sets", unitsets: ["s1", "s2"], when: { script: "true" } })).toBe(a);
    expect(branchFingerprint({ mode: "sets", unitsets: ["s1", "s3"] })).not.toBe(a);
    expect(branchFingerprint({ mode: "all", unitset: "a", overlap: { unitset: "o" } })).not.toBe(branchFingerprint({ mode: "all", unitset: "a" }));
  });
});

describe("constants become snippets", () => {
  it("moves layout constants to snippets, and $const values in the template and question texts to $snippet", () => {
    const loop = migrateLegacyUnitLoop({
      type: "unit_loop",
      units: [{ mode: "all", unitset: "__all__" }],
      layout: { template: "$const.intro::markdown\n{{ $const.note }}\n$unit.text", constants: { intro: "**Hi**", note: "n" } },
      children: [{ type: "question", name: "q", variable: { type: "confirm", question: "About $const.intro" } }],
    }) as { layout: Record<string, unknown>; children: { variable: { question: string } }[] };
    expect(loop.layout).toEqual({ template: "$snippet.intro\n$snippet.note\n$unit.text", snippets: { intro: "**Hi**", note: "n" } });
    expect(loop.children[0].variable.question).toBe("About $snippet.intro");
  });
});

describe("span fields", () => {
  it("migrates a span question's column to fields", () => {
    const [item] = migrateCodebookItems([q("s", { type: "span", question: "?", column: "text", options: [{ value: "x" }] })]) as { variable: object }[];
    expect(item.variable).toEqual({ type: "span", question: "?", fields: ["text"], options: [{ value: "x" }] });
  });
});
