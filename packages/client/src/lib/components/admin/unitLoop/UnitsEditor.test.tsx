import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Invite, LoopUnits, SetGroupResponse } from "@annotinder/contracts";
import { UnitsEditor } from "./UnitsEditor";

const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
const groups: SetGroupResponse[] = [
  { name: "test_unit", sets: [set("overlap", [1]), set("gold", [2, 3])] },
  { name: "part_set", sets: [set("pre", [4]), set("post", [5])] },
];

function render(
  units: LoopUnits,
  invite: Invite,
  earlier: { number: number; title: string }[] = [],
  withGroups = groups,
) {
  return renderToStaticMarkup(
    <UnitsEditor
      units={units}
      groups={withGroups}
      checkable={[]}
      agreeable={[]}
      screenouts={[]}
      context={{ invite, sources: [], earlier }}
      issues={[]}
      onChange={() => {}}
    />,
  );
}

describe("a loop's Units settings", () => {
  it("for a crowd: a part, dividing or not, and the test units (none of a type: disabled)", () => {
    const html = render({ part: "pre" }, { mode: "crowd" });
    expect(html).toContain('<option value="pre" selected="">pre (1)</option>');
    expect(html).toContain("Everyone codes everything");
    expect(html).toContain("Divide units among coders");
    expect(html).toContain("Coding and test units");
    // No practice units: that setting is disabled
    expect(html).toMatch(/aria-label="Practice units" disabled=""/);
    expect(html).not.toMatch(/aria-label="Gold units" disabled=""/);
    expect(html).toContain("Spread throughout");
  });

  it("for specific coders: no dividing", () => {
    const html = render({}, { mode: "coders", link: "per_coder" });
    expect(html).not.toContain("Divide units among coders");
    expect(html).toContain('<option value="" selected="">All units</option>');
  });

  it("without a part set or test units: says so", () => {
    const html = render({}, { mode: "crowd" }, [], []);
    expect(html).toContain("The units have no part set (part_set) yet.");
    expect(html).toContain("The units have no test units (test_unit) yet");
  });

  it("a loop can take the previous loop's units: then no part or dividing", () => {
    const html = render({ sameAsPrevious: true }, { mode: "crowd" }, [{ number: 1, title: "First pass" }]);
    expect(html).toContain(
      '<option value="previous" selected="">The units each coder got in the previous loop (First pass)</option>',
    );
    expect(html).not.toContain('aria-label="Part"');
    expect(html).not.toContain("Divide units among coders");
  });
});
