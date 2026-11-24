import type { ComponentProps } from "react";
import type { DesignIssue, DesignItem } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";
import { IssueList } from "../IssueList";
import { issuesAt } from "../issues";
import { VariableTypeForm } from "../VariableTypeForm";

type ExperimentItem = Extract<DesignItem, { type: "experiment" }>;

/** An experiment's conditions and how coders are assigned to them. */
export function ExperimentForm({
  item,
  stratifyChoices,
  experiment,
  issues,
  onChange,
}: {
  item: ExperimentItem;
  /** What a balanced draw can balance within. */
  stratifyChoices: string[];
  /** What the conditions can come from: the units' columns, the URL parameters. */
  experiment: ComponentProps<typeof VariableTypeForm>["experiment"];
  issues: DesignIssue[];
  onChange: (updated: DesignItem) => void;
}) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Each coder gets one condition, drawn when they reach this point; never shown to the coder.
        <HelpButton topic="random-condition" label="Help: experiments" />
      </p>
      <VariableTypeForm
        variable={item.variable}
        stratifyChoices={stratifyChoices}
        experiment={experiment}
        onChange={(variable) => onChange({ ...item, variable } as DesignItem)}
      />
      <IssueList issues={issuesAt(issues, "variable")} />
    </>
  );
}
