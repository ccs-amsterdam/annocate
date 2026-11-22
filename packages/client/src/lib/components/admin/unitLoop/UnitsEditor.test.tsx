import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Invite, LoopUnits, SetGroupResponse } from "@annotinder/contracts";
import { UnitsEditor } from "./UnitsEditor";

const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
const groups: SetGroupResponse[] = [
  { name: "special", sets: [set("_overlap", [1]), set("_gold", [2, 3])] },
  { name: "phase", sets: [set("pre", [4]), set("post", [5])] },
];

function render(units: LoopUnits, invite: Invite, earlier: { number: number; title: string }[] = []) {
  return renderToStaticMarkup(
    <UnitsEditor
      units={units}
      groups={groups}
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
  it("for a crowd: a subset, dividing or not, and the special units of the crowd's column (none: disabled)", () => {
    const html = render({ subset: { column: "phase", sets: ["pre"] } }, { mode: "crowd", column: "special" });
    expect(html).toContain("Select unit subset(s)");
    expect(html).toMatch(/aria-pressed="true"[^>]*>pre/);
    expect(html).toContain("Everyone codes everything");
    expect(html).toContain("Divide units among coders");
    expect(html).toContain("of column <span");
    // No practice units in the column: that setting is disabled
    expect(html).toMatch(/aria-label="Practice units" disabled=""/);
    expect(html).not.toMatch(/aria-label="Gold units" disabled=""/);
    expect(html).toContain("Spread throughout");
  });

  it("for specific coders: no dividing, the coders' column can't be a subset", () => {
    const html = render({}, { mode: "coders", column: "special", link: "per_coder" });
    expect(html).not.toContain("Divide units among coders");
    expect(html).toContain('<option value="special" disabled="">special (coder unit assignment)</option>');
  });

  it("without the assignment's column: no special units, a pointer to Coder unit assignments", () => {
    const html = render({}, { mode: "crowd" });
    expect(html).not.toContain("Overlap units");
    expect(html).toContain("Coder unit assignments");
  });

  it("a later loop can take an earlier loop's units: then no subset or dividing", () => {
    const html = render({ sameAs: 1 }, { mode: "crowd" }, [{ number: 1, title: "First pass" }]);
    expect(html).toContain('<option value="1" selected="">The units each coder got in First pass</option>');
    expect(html).not.toContain("Select unit subset(s)");
    expect(html).not.toContain("Divide units among coders");
  });
});
