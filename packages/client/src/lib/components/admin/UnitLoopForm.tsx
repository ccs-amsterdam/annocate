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
import { selectClass, checkableQuestions, agreeableQuestions } from "./unitLoop/helpers";
import { Section } from "./unitLoop/Section";
import { UnitsEditor } from "./unitLoop/UnitsEditor";

/**
 * Edits a unit_loop: which units coders get (contracts unitLoop.ts: the
 * loop's `units` settings), and the order. How units are shown is up to
 * the layout items in the loop.
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
  /** The rest of the design as the Units tab needs it: the coder unit assignment, earlier loops. */
  unitsContext?: LoopUnitsContext;
  /** The design's end items with outcome `screenout`: where gold checks can end a session. */
  screenouts?: string[];
  /** For "Generate sets…" (absent: not offered). */
  client?: ResearcherApi;
  /** The study's set groups. */
  groups: SetGroupResponse[];
  validationIssues: DesignIssue[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  return (
    <UnitsSettings
      loop={loop}
      client={client}
      groups={groups}
      screenouts={screenouts}
      validationIssues={validationIssues}
      unitsContext={unitsContext}
      onChange={onChange}
    />
  );
}

/** Which units coders get (the loop's `units`), and the order. */
function UnitsSettings({
  loop,
  client,
  groups,
  screenouts,
  validationIssues,
  unitsContext,
  onChange,
}: {
  loop: UnitLoopItem;
  client?: ResearcherApi;
  groups: SetGroupResponse[];
  screenouts: string[];
  validationIssues: DesignIssue[];
  unitsContext: LoopUnitsContext;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const setUnits = (units: LoopUnits) => {
    const next: UnitLoopItem = { ...loop, units };
    // Nothing set: all the session's units, once (the default)
    if (Object.keys(units).length === 0) delete next.units;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-5">
      <UnitsEditor
        units={loop.units ?? {}}
        client={client}
        groups={groups}
        checkable={checkableQuestions(loop.children as DesignItem[])}
        agreeable={agreeableQuestions(loop.children as DesignItem[])}
        // Right answers are given with the units as the loop's first layout shows them
        answerKey={client ? { client, layout: loopLayouts(loop.children)[0] ?? { template: "" } } : undefined}
        screenouts={screenouts}
        context={unitsContext}
        issues={issuesAt(validationIssues, "units")}
        onChange={setUnits}
      />

      <Section title="Order" topic="unit-distribution#order">
        <select
          className={`${selectClass} w-fit`}
          value={loop.order ?? "sequential"}
          onChange={(e) => onChange({ ...loop, order: e.target.value as UnitLoopItem["order"] })}
        >
          <option value="sequential">In set order</option>
          <option value="random">Random (each coder their own order)</option>
        </select>
      </Section>
    </div>
  );
}
