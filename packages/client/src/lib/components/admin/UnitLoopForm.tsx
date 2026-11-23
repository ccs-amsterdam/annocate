import {
  loopLayouts,
  type DesignItem,
  type DesignIssue,
  type SetGroupResponse,
  type LoopUnits,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { issuesAt } from "./issues";
import { type LoopUnitsContext } from "../../design/assignment";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { selectClass, checkableQuestions, agreeableQuestions, testUnitsSummary } from "./unitLoop/helpers";
import { FoldedSection, Section } from "./unitLoop/Section";
import { UnitsEditor } from "./unitLoop/UnitsEditor";
import { TestUnitsEditor } from "./unitLoop/SpecialUnits";

/**
 * Edits a unit_loop: which units coders get (contracts unitLoop.ts: the
 * loop's `units` settings), its test units, and the order. How units are
 * shown is up to the layout items in the loop.
 */
export function UnitLoopForm({
  loop,
  client,
  groups,
  screenouts = [],
  validationIssues,
  unitsContext = { invite: { mode: "crowd" }, sources: [], earlier: [] },
  onChange,
}: {
  loop: UnitLoopItem;
  /** The rest of the design as the units settings need it: the coder unit assignment, earlier loops. */
  unitsContext?: LoopUnitsContext;
  /** The design's end items with outcome `screenout`: where gold checks can end a session. */
  screenouts?: string[];
  /** For writing right answers (absent: not offered). */
  client?: ResearcherApi;
  /** The study's set groups. */
  groups: SetGroupResponse[];
  validationIssues: DesignIssue[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  const setUnits = (units: LoopUnits) => {
    const next: UnitLoopItem = { ...loop, units };
    // Nothing set: all the session's units, once (the default)
    if (Object.keys(units).length === 0) delete next.units;
    onChange(next);
  };
  const units = loop.units ?? {};
  const unitsIssues = issuesAt(validationIssues, "units");
  // The checks' issues go with the test units; the rest (part, dividing) with the units
  const testIssues = [...issuesAt(unitsIssues, "practiceCheck"), ...issuesAt(unitsIssues, "goldCheck")];
  const order = loop.order ?? "sequential";
  return (
    <div className="flex flex-col gap-4">
      {/* What is set for every loop open; the rarely changed settings folded, with their summary */}
      <Section title="Units and coders" topic="unit-distribution">
        <UnitsEditor
          units={units}
          groups={groups}
          agreeable={agreeableQuestions(loop.children as DesignItem[])}
          context={unitsContext}
          client={client}
          issues={unitsIssues.filter((issue) => !testIssues.includes(issue))}
          onChange={setUnits}
        />
      </Section>

      <FoldedSection
        title="Test units"
        topic="special-units"
        summary={testUnitsSummary(units, groups)}
        issues={testIssues}
      >
        <TestUnitsEditor
          units={units}
          groups={groups}
          invite={unitsContext.invite}
          checkable={checkableQuestions(loop.children as DesignItem[])}
          // Right answers are given with the units as the loop's first layout shows them
          answerKey={client ? { client, layout: loopLayouts(loop.children)[0] ?? { template: "" } } : undefined}
          screenouts={screenouts}
          onChange={setUnits}
        />
      </FoldedSection>

      <FoldedSection
        title="Order"
        topic="unit-distribution#order"
        summary={order === "random" ? "Random" : "In set order"}
        issues={issuesAt(validationIssues, "order")}
      >
        <select
          aria-label="Order"
          className={`${selectClass} w-fit`}
          value={order}
          onChange={(e) => onChange({ ...loop, order: e.target.value as UnitLoopItem["order"] })}
        >
          <option value="sequential">In set order</option>
          <option value="random">Random (each coder their own order)</option>
        </select>
      </FoldedSection>
    </div>
  );
}
