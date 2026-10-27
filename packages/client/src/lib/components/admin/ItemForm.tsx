import {
  ALL_UNITS_UNITSET,
  type AnyVariableType,
  type CodebookItem,
  type Condition,
  type UnitLoopItem,
  type UnitsetResponse,
  type CodebookValidationIssue,
  type EndItem,
} from "@annotinder/contracts";
import { UnitLoopForm } from "./UnitLoopForm";
import { ConditionEditor } from "./ConditionEditor";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  VariableTypeForm,
  defaultVariableForAnyType,
  switchVariableType,
  VARIABLE_TYPE_LABELS,
  VARIABLE_TYPE_OPTIONS_USER,
  VARIABLE_TYPE_OPTIONS_UNIT,
} from "./VariableTypeForm";

export const ITEM_TYPE_OPTIONS_TOP: CodebookItem["type"][] = ["question", "unit_loop", "condition", "end"];
export const ITEM_TYPE_OPTIONS_IN_LOOP: CodebookItem["type"][] = ["question", "condition", "end"];

export function defaultItemForType(
  type: CodebookItem["type"],
  name: string,
  childName?: string,
): CodebookItem {
  const qName = childName || `${name}_q1`;
  switch (type) {
    case "question":
      return {
        type: "question",
        name,
        variable: defaultVariableForAnyType("confirm"),
      } as CodebookItem;
    case "user_variable":
      return {
        type: "user_variable",
        name,
        variable: defaultVariableForAnyType("confirm"),
      } as CodebookItem;
    case "unit_variable":
      return {
        type: "unit_variable",
        name,
        variable: defaultVariableForAnyType("confirm"),
      } as CodebookItem;
    case "unit_loop":
      return {
        type: "unit_loop",
        units: [{ mode: "all", unitset: ALL_UNITS_UNITSET }],
        layout: { template: "" },
        children: [
          {
            type: "question",
            name: qName,
            variable: defaultVariableForAnyType("confirm"),
          },
        ],
      } as CodebookItem;
    case "condition":
      return {
        type: "condition",
        condition: { script: "true" },
        children: [],
      } as CodebookItem;
    case "end":
      return { type: "end", name, outcome: "screenout" };
  }
}

export function ItemForm({
  item,
  unitsets,
  unitVariableNames = [],
  availableQuestions = [],
  loopConstants = null,
  validationIssues = [],
  isInsideLoop = false,
  onChange,
}: {
  item: CodebookItem;
  unitsets: UnitsetResponse[];
  unitVariableNames?: string[];
  /** Questions references may use at this item (contracts `availableQuestions`): for conditions and branches. */
  availableQuestions?: { name: string; variable: AnyVariableType }[];
  /** The layout constants of the enclosing unit loop, if the item is inside one. */
  loopConstants?: string[] | null;
  validationIssues?: CodebookValidationIssue[];
  isInsideLoop?: boolean;
  onChange: (updated: CodebookItem) => void;
}) {
  const getFieldError = (field: string) => {
    const issue = validationIssues.find((i) => i.path.includes(field));
    return issue ? issue.message : null;
  };

  const nameError = getFieldError("name");

  return (
    <div className="flex flex-col gap-4">
      {item.type === "condition" || item.type === "unit_loop" ? (
        // Conditions and unit loops have no name: an optional label shows in the tree (and for loops in exports).
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">Label (optional)</label>
          <Input
            value={item.label ?? ""}
            onChange={(e) => onChange({ ...item, label: e.target.value || undefined })}
            placeholder={item.type === "condition" ? "Shown in the tree instead of the condition, e.g. Too young" : "e.g. News items"}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">Item Name</label>
          <Input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            placeholder="e.g., sentiment, age, loop_1"
            className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
      )}

      {/* Item-specific fields */}
      {(item.type === "question" || item.type === "user_variable" || item.type === "unit_variable") && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Answer Type</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold"
              value={item.variable.type}
              onChange={(e) =>
                onChange({ ...item, variable: switchVariableType(item.variable, e.target.value as AnyVariableType["type"]) } as CodebookItem)
              }
            >
              {(isInsideLoop ? VARIABLE_TYPE_OPTIONS_UNIT : VARIABLE_TYPE_OPTIONS_USER).map((t) => (
                <option key={t} value={t}>
                  {VARIABLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <VariableTypeForm
            variable={item.variable}
            unitVariableNames={unitVariableNames}
            onChange={(variable) => onChange({ ...item, variable } as CodebookItem)}
          />
          {/* Reference problems in the question and instruction texts, and others about the answer type */}
          <IssueList issues={issuesAt(validationIssues, "variable")} />
        </>
      )}

      {item.type === "unit_loop" && (
        <div className="flex flex-col gap-4 border-t border-border/60 pt-4">
          <UnitLoopForm
            loop={item as UnitLoopItem}
            unitsets={unitsets}
            coderQuestions={availableQuestions}
            validationIssues={validationIssues}
            onChange={(loop) => onChange(loop)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Template</label>
            <Textarea
              value={(item as UnitLoopItem).layout?.template ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  layout: { ...(item as UnitLoopItem).layout, template: e.target.value },
                } as CodebookItem)
              }
              rows={4}
              placeholder={"# $unit.headline\n\n$unit.text::tokenize"}
              className={`font-mono text-xs ${issuesAt(validationIssues, "layout").some((i) => !i.warning) ? "border-destructive" : ""}`}
            />
            <IssueList issues={issuesAt(validationIssues, "layout")} />
          </div>
        </div>
      )}

      {item.type === "end" && (
        <EndItemFields item={item as EndItem} onChange={onChange} issues={validationIssues} />
      )}

      {item.type === "condition" && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <label className="text-xs font-semibold text-foreground">Show the items in this condition if</label>
          <ConditionEditor
            condition={(item as { condition: Condition }).condition ?? { script: "true" }}
            onChange={(condition) => onChange({ ...item, condition } as CodebookItem)}
            questions={availableQuestions}
            loop={loopConstants ? { constants: loopConstants } : null}
            issues={issuesAt(validationIssues, "condition")}
          />
        </div>
      )}
    </div>
  );
}

/** An `end` item: how the session ends, the message shown, and where the coder is sent. */
function EndItemFields({
  item,
  onChange,
  issues,
}: {
  item: EndItem;
  onChange: (updated: CodebookItem) => void;
  issues: CodebookValidationIssue[];
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Outcome</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-xs"
          value={item.outcome}
          onChange={(e) => onChange({ ...item, outcome: e.target.value as EndItem["outcome"] })}
        >
          <option value="screenout">Screened out (not eligible)</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Message (optional)</label>
        <Textarea
          value={item.message ?? ""}
          rows={3}
          onChange={(e) => onChange({ ...item, message: e.target.value || undefined })}
          placeholder="Thank you for your time."
        />
        <IssueList issues={issuesAt(issues, "message")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Redirect to (optional)</label>
        <Input
          value={item.redirectUrl ?? ""}
          onChange={(e) => onChange({ ...item, redirectUrl: e.target.value || undefined })}
          placeholder="https://panel.example/return?status=screenout&id=$var.pid.value"
          className="font-mono text-xs"
        />
        <IssueList issues={issuesAt(issues, "redirectUrl")} />
      </div>
    </div>
  );
}
