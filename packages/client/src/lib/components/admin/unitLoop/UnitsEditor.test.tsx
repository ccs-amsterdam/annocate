import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Invite, LoopUnits, SetGroupResponse } from "@annotinder/contracts";
import { UnitsEditor } from "./UnitsEditor";
import { TestUnitsEditor } from "./SpecialUnits";
import { testUnitsSummary } from "./helpers";

const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
const groups: SetGroupResponse[] = [
  { name: "test_set", sets: [set("overlap", [1]), set("gold", [2, 3])] },
  { name: "part_set", sets: [set("pre", [4]), set("post", [5])] },
];

function render(units: LoopUnits, invite: Invite, earlier: { title: string }[] = [], withGroups = groups) {
  return renderToStaticMarkup(
    <UnitsEditor
      units={units}
      groups={withGroups}
      agreeable={[]}
      context={{ invite, sources: [], earlier }}
      issues={[]}
      onChange={() => {}}
    />,
  );
}

function renderTests(units: LoopUnits, withGroups = groups) {
  return renderToStaticMarkup(
    <TestUnitsEditor
      units={units}
      groups={withGroups}
      invite={{ mode: "crowd" }}
      checkable={[]}
      screenouts={[]}
      onChange={() => {}}
    />,
  );
}

describe("a loop's Units settings", () => {
  it("for a crowd: a part, dividing or not", () => {
    const html = render({ part: "pre" }, { mode: "crowd" });
    expect(html).toContain('<option value="pre" selected="">pre (1)</option>');
    expect(html).toContain("Everyone codes everything");
    expect(html).toContain("Divide units among coders");
  });

  it("the test units (none of a type: disabled)", () => {
    const html = renderTests({});
    // No practice units: that setting is disabled
    expect(html).toMatch(/aria-label="Practice units" disabled=""/);
    expect(html).not.toMatch(/aria-label="Gold units" disabled=""/);
    expect(html).toContain("Spread throughout");
  });

  it("sums up the test units in a line (types the units have)", () => {
    expect(testUnitsSummary({}, groups)).toBe("overlap spread · gold spread");
    expect(
      testUnitsSummary(
        {
          gold: "after",
          overlap: "ignore",
          goldCheck: { questions: ["topic"], health: { start: 5, wrong: -1, end: "out" } },
        },
        groups,
      ),
    ).toBe("overlap left out · gold after · checks: topic · health");
    expect(testUnitsSummary({}, [])).toBe("None in the units");
  });

  it("for expert coders: no dividing", () => {
    const html = render({}, { mode: "coders", link: "per_coder" });
    expect(html).not.toContain("Divide units among coders");
    expect(html).toContain('<option value="" selected="">All units</option>');
  });

  it("without a part set or test units: says so", () => {
    expect(render({}, { mode: "crowd" }, [], [])).toContain("The units have no part set (part_set) yet.");
    expect(renderTests({}, [])).toContain("The units have no test units (test_set) yet");
  });

  it("a loop can take the previous loop's units: then no part or dividing", () => {
    const html = render({ sameAsPrevious: true }, { mode: "crowd" }, [{ title: "First pass" }]);
    expect(html).toContain(
      '<option value="previous" selected="">The units each coder got in the previous loop (First pass)</option>',
    );
    expect(html).not.toContain('aria-label="Part"');
    expect(html).not.toContain("Divide units among coders");
  });
});
