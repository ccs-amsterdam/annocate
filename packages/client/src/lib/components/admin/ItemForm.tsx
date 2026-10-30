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
import { cn } from "cn";
import { UnitLoopForm } from "./UnitLoopForm";
import { HelpButton } from "../../help/HelpButton";
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

/** The help topic for each answer type. */
const TYPE_HELP: Record<AnyVariableType["type"], string> = {
  nominal: "nominal-and-ordinal",
  ordinal: "nominal-and-ordinal",
  numeric: "numeric",
  scale: "scale",
  annotinder: "swipe",
  confirm: "confirm",
  auto: "auto",
  span: "span",
  relation: "relation",
  unspecified: "question-types",
};

export function defaultItemForType(type: CodebookItem["type"], name: string): CodebookItem {
  switch (type) {
    case "question":
      return {
        type: "question",
        name,
        variable: defaultVariableForAnyType("confirm"),
      } as CodebookItem;
    case "unit_loop":
      // Like a condition, a new loop starts empty: its questions are added in the tree.
      return {
        type: "unit_loop",
        units: [{ mode: "all", unitset: ALL_UNITS_UNITSET }],
        layout: { template: "" },
        children: [],
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
  inLoop = false,
  unitFields = [],
  loopNames,
  readOnly = false,
  validationIssues = [],
  isInsideLoop = false,
  onChange,
}: {
  item: CodebookItem;
  unitsets: UnitsetResponse[];
  unitVariableNames?: string[];
  /** Questions references may use at this item (contracts `availableQuestions`): for conditions and branches. */
  availableQuestions?: { name: string; variable: AnyVariableType }[];
  /** The item is inside a unit loop (conditions may use `$unit`). */
  inLoop?: boolean;
  /** The job's unit fields (completions in a loop's template). */
  unitFields?: string[];
  /** For a question in a loop: the names its layout shows ("Show field"), and what span questions can select in. */
  loopNames?: { shown: string[]; selectable: string[] };
  readOnly?: boolean;
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
          <span className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-foreground">Label (optional)</label>
            <HelpButton topic={item.type === "condition" ? "conditions" : "unit-loops"} label="Help" />
          </span>
          <Input
            value={item.label ?? ""}
            onChange={(e) => onChange({ ...item, label: e.target.value || undefined })}
            placeholder={item.type === "condition" ? "Shown in the tree instead of the condition, e.g. Too young" : "e.g. News items"}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-foreground">Item Name</label>
            <HelpButton topic={item.type === "end" ? "end-items" : "questions"} label="Help" />
          </span>
          <Input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            placeholder="e.g. sentiment, age"
            className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
      )}

      {/* Item-specific fields */}
      {item.type === "question" && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-foreground">Answer Type</label>
            <HelpButton topic={TYPE_HELP[item.variable.type]} label="Help: this answer type" />
          </span>
            <select
              className={cn(
                "h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold",
                item.variable.type === "unspecified" && "border-amber-500 text-amber-700 dark:text-amber-400",
              )}
              value={item.variable.type}
              onChange={(e) =>
                onChange({ ...item, variable: switchVariableType(item.variable, e.target.value as AnyVariableType["type"]) } as CodebookItem)
              }
            >
              {item.variable.type === "unspecified" && (
                <option value="unspecified" disabled>
                  Choose an answer type...
                </option>
              )}
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
            layoutFields={isInsideLoop ? loopNames?.selectable : undefined}
            onChange={(variable) => onChange({ ...item, variable } as CodebookItem)}
          />
          {isInsideLoop && loopNames && (
            <FocusSelect
              variable={item.variable}
              loopIds={loopNames.shown}
              onChange={(variable) => onChange({ ...item, variable } as CodebookItem)}
            />
          )}
          {/* Reference problems in the question and instruction texts, and others about the answer type */}
          <IssueList issues={issuesAt(validationIssues, "variable")} />
        </>
      )}

      {item.type === "unit_loop" && (
        <UnitLoopForm
          loop={item as UnitLoopItem}
          unitsets={unitsets}
          unitFields={unitFields}
          coderQuestions={availableQuestions}
          validationIssues={validationIssues}
          readOnly={readOnly}
          onChange={(loop) => onChange(loop)}
        />
      )}

      {item.type === "end" && (
        <EndItemFields item={item as EndItem} onChange={onChange} issues={validationIssues} />
      )}

      {item.type === "condition" && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <span className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-foreground">Show the items in this condition if</label>
            <HelpButton topic="conditions" label="Help: conditions" />
          </span>
          <ConditionEditor
            condition={(item as { condition: Condition }).condition ?? { script: "true" }}
            onChange={(condition) => onChange({ ...item, condition } as CodebookItem)}
            questions={availableQuestions}
            loop={inLoop}
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
        <span className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-foreground">Outcome</label>
            <HelpButton topic="end-items" label="Help: ending a session" />
          </span>
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

/** "Focus on": the parts of the layout the question is about, by id (docs/client.md §3, "Focus"). */
function FocusSelect({
  variable,
  loopIds,
  onChange,
}: {
  variable: AnyVariableType;
  loopIds: string[];
  onChange: (variable: AnyVariableType) => void;
}) {
  const focus = ("focus" in variable ? variable.focus : undefined) ?? [];
  const dim = "focusDim" in variable && variable.focusDim === true;
  const ids = [...new Set([...loopIds, ...focus])];
  const set = (next: { focus?: string[]; focusDim?: boolean }) => {
    const updated = { ...variable, ...next } as AnyVariableType & { focus?: string[]; focusDim?: boolean };
    if (!updated.focus?.length) delete updated.focus;
    if (!updated.focusDim) delete updated.focusDim;
    onChange(updated);
  };
  const toggle = (id: string) => set({ focus: focus.includes(id) ? focus.filter((f) => f !== id) : [...focus, id] });
  const spanDefault = variable.type === "span" && focus.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-foreground">Focus on (optional)</span>
        <HelpButton topic="typed-blocks#ids" label="Help: ids in the layout" />
      </span>
      {ids.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">The layout shows no unit fields or named blocks yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => {
            const shown = loopIds.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={focus.includes(id)}
                title={shown ? undefined : "The layout doesn't show this"}
                className={cn(
                  "cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[11px]",
                  !shown
                    ? "border-destructive text-destructive"
                    : focus.includes(id)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {id}
              </button>
            );
          })}
        </div>
      )}
      <label className="flex w-fit items-center gap-2 text-xs">
        <input type="checkbox" checked={dim} disabled={focus.length === 0 && !spanDefault} onChange={(e) => set({ focusDim: e.target.checked })} />
        Dim the rest of the unit
      </label>
      <p className="text-[11px] text-muted-foreground">
        {spanDefault ? "By default the fields it selects in. " : ""}When this question comes up, the unit scrolls to the first and highlights it.
      </p>
    </div>
  );
}
