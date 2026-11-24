import type { AnyVariableType, DesignIssue, DesignItem, UnitLoopItem } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";
import { withLoopCondition } from "../../../design/itemSettings";
import { ConditionEditor } from "../ConditionEditor";
import { issuesAt } from "../issues";

// The condition of a branch (who gets its items) and of a unit loop (who gets the loop).

type BranchItem = Extract<DesignItem, { type: "branch" }>;

interface ConditionProps {
  /** Questions the condition may use (contracts `availableQuestions`). */
  questions: { name: string; variable: AnyVariableType }[];
  /** The item is inside a unit loop: its condition may use `$unit`. */
  inLoop: boolean;
  issues: DesignIssue[];
  onChange: (updated: DesignItem) => void;
}

/** A branch's condition: required (a new branch's is empty until set; validation says so). */
export function BranchForm({ item, questions, inLoop, issues, onChange }: ConditionProps & { item: BranchItem }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
      <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
        Only show these items if…
        <HelpButton topic="conditions" label="Help: conditions" />
      </span>
      <ConditionEditor
        condition={item.condition ?? { script: "" }}
        onChange={(condition) => onChange({ ...item, condition })}
        questions={questions}
        loop={inLoop}
        issues={issuesAt(issues, "condition")}
      />
    </div>
  );
}

/** A loop's condition: optional (absent: coders always get the loop). */
export function LoopConditionField({
  item,
  questions,
  inLoop,
  issues,
  onChange,
}: ConditionProps & { item: UnitLoopItem }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
      <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <input
          type="checkbox"
          checked={item.condition !== undefined}
          onChange={(e) => onChange(withLoopCondition(item, e.target.checked))}
        />
        Only give coders this loop if…
        <HelpButton topic="conditions" label="Help: conditions" />
      </label>
      {item.condition && (
        <ConditionEditor
          condition={item.condition}
          onChange={(condition) => onChange({ ...item, condition } as DesignItem)}
          questions={questions}
          loop={inLoop}
          issues={issuesAt(issues, "condition")}
        />
      )}
    </div>
  );
}
