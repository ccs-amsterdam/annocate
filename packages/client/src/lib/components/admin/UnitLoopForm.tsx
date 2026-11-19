import { cn } from "cn";
import {
  type AnyVariableType,
  type DesignItem,
  type DesignIssue,
  type SetGroupResponse,
  type LoopUnits,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { useLoopTab, type LoopTab } from "./designEditor/loopTab";
import { issuesAt } from "./issues";
import { type ShareSource } from "../../design/assignment";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { selectClass, checkableQuestions, agreementQuestions } from "./unitLoop/helpers";
import { Section } from "./unitLoop/Section";
import { LayoutTab } from "./unitLoop/LayoutTab";
import { UnitsEditor } from "./unitLoop/UnitsEditor";

/**
 * Edits a unit_loop, in two tabs: how a unit is shown (the template and
 * its snippets), and which units coders get (contracts
 * unitLoop.ts: the loop's `units` settings, and the order).
 */
export function UnitLoopForm({
  loop,
  client,
  groups,
  unitFields,
  coderQuestions,
  screenouts = [],
  validationIssues,
  shareSources = [],
  readOnly = false,
  onChange,
}: {
  loop: UnitLoopItem;
  /** What selects a session's units (its coder, linked conditions): for the Units tab's summary. */
  shareSources?: ShareSource[];
  /** The design's end items with outcome `screenout`: where gold checks can end a session. */
  screenouts?: string[];
  /** For "Generate sets…" (absent: not offered). */
  client?: ResearcherApi;
  /** The study's set groups. */
  groups: SetGroupResponse[];
  /** The study's unit fields, for completions in the template. */
  unitFields: string[];
  /** Coder-level questions before the loop: what the layout's conditions may use. */
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: DesignIssue[];
  readOnly?: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const [tab, setTab] = useLoopTab();
  const tabs: { value: LoopTab; label: string; issues: DesignIssue[] }[] = [
    { value: "layout", label: "Layout", issues: issuesAt(validationIssues, "layout") },
    {
      value: "units",
      label: "Units",
      issues: [...issuesAt(validationIssues, "units"), ...issuesAt(validationIssues, "order")],
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.issues.some((i) => !i.warning) && (
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" title="Has problems" />
            )}
          </button>
        ))}
      </div>
      {tab === "units" ? (
        <UnitsTab
          loop={loop}
          client={client}
          groups={groups}
          screenouts={screenouts}
          validationIssues={validationIssues}
          shareSources={shareSources}
          onChange={onChange}
        />
      ) : (
        <LayoutTab
          loop={loop}
          unitFields={unitFields}
          coderQuestions={coderQuestions}
          issues={issuesAt(validationIssues, "layout")}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Which units coders get (the loop's `units`), and the order. */
function UnitsTab({
  loop,
  client,
  groups,
  screenouts,
  validationIssues,
  shareSources,
  onChange,
}: {
  loop: UnitLoopItem;
  client?: ResearcherApi;
  groups: SetGroupResponse[];
  screenouts: string[];
  validationIssues: DesignIssue[];
  shareSources: ShareSource[];
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
        agreeable={agreementQuestions(loop.children as DesignItem[])}
        checkable={checkableQuestions(loop.children as DesignItem[])}
        answerKey={client && loop.layout ? { client, layout: loop.layout } : undefined}
        screenouts={screenouts}
        shareSources={shareSources}
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
