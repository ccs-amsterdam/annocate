import type {
  CodebookItem,
  UnitsetResponse,
  CodebookValidationIssue,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  VariableTypeForm,
  defaultVariableForAnyType,
  VARIABLE_TYPE_OPTIONS_USER,
  VARIABLE_TYPE_OPTIONS_UNIT,
} from "./VariableTypeForm";

export const ITEM_TYPE_OPTIONS_TOP: CodebookItem["type"][] = ["question", "unit_loop", "condition"];
export const ITEM_TYPE_OPTIONS_IN_LOOP: CodebookItem["type"][] = ["question", "condition"];

export function defaultItemForType(
  type: CodebookItem["type"],
  name: string,
  _inLoop = false,
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
        variable: defaultVariableForAnyType("confirm") as any,
      } as CodebookItem;
    case "unit_variable":
      return {
        type: "unit_variable",
        name,
        variable: defaultVariableForAnyType("confirm") as any,
      } as CodebookItem;
    case "unit_loop":
      return {
        type: "unit_loop",
        name,
        layout: { template: "" },
        children: [
          {
            type: "question",
            name: qName,
            variable: defaultVariableForAnyType("confirm"),
          } as any,
        ],
      } as CodebookItem;
    case "condition":
      return {
        type: "condition",
        name,
        expression: "true",
        children: [],
      } as CodebookItem;
  }
}

export function ItemForm({
  item,
  unitsets,
  unitVariableNames = [],
  validationIssues = [],
  isInsideLoop = false,
  onChange,
}: {
  item: CodebookItem;
  unitsets: UnitsetResponse[];
  unitVariableNames?: string[];
  validationIssues?: CodebookValidationIssue[];
  isInsideLoop?: boolean;
  onChange: (updated: CodebookItem) => void;
}) {
  const getFieldError = (field: string) => {
    const issue = validationIssues.find((i) => i.path.includes(field));
    return issue ? issue.message : null;
  };

  const nameError = getFieldError("name");
  const unitsetError = getFieldError("unitset");
  const templateError = getFieldError("template");
  const expressionError = getFieldError("expression");

  return (
    <div className="flex flex-col gap-4">
      {/* Item Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Item Name</label>
        <Input
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="e.g., sentiment, age, loop_1"
          className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {nameError ? (
          <p className="text-xs text-destructive">{nameError}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Must start with a letter or underscore, containing only letters, numbers, and underscores.
          </p>
        )}
      </div>

      {/* Item-specific fields */}
      {(item.type === "question" || item.type === "user_variable" || item.type === "unit_variable") && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Answer Type</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold capitalize"
              value={item.variable.type}
              onChange={(e) => {
                const nextType = e.target.value as any;
                onChange({
                  ...item,
                  variable: defaultVariableForAnyType(nextType),
                } as CodebookItem);
              }}
            >
              {(isInsideLoop ? VARIABLE_TYPE_OPTIONS_UNIT : VARIABLE_TYPE_OPTIONS_USER).map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <VariableTypeForm
            variable={item.variable as any}
            unitVariableNames={unitVariableNames}
            onChange={(variable) => onChange({ ...item, variable } as CodebookItem)}
          />
        </>
      )}

      {item.type === "unit_loop" && (
        <div className="flex flex-col gap-4 border-t border-border/60 pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Unitset</label>
            <select
              className={`h-9 rounded-md border bg-background px-3 text-sm ${
                unitsetError ? "border-destructive" : "border-input"
              }`}
              value={(item as any).unitset}
              onChange={(e) => onChange({ ...item, unitset: e.target.value } as CodebookItem)}
            >
              <option value="">Select a unitset...</option>
              {unitsets.map((u) => (
                <option key={u.name} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
            {unitsetError ? (
              <p className="text-xs text-destructive">{unitsetError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                The unitset this loop iterates over.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Template</label>
            <Textarea
              value={(item as any).layout?.template ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  layout: { ...(item as any).layout, template: e.target.value },
                } as CodebookItem)
              }
              rows={4}
              placeholder="e.g., {{ text }} or <p>{{ title }}</p>"
              className={`font-mono text-xs ${templateError ? "border-destructive" : ""}`}
            />
            {templateError ? (
              <p className="text-xs text-destructive">{templateError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Mustache template for presenting the unit.
              </p>
            )}
          </div>
        </div>
      )}

      {item.type === "condition" && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <label className="text-xs font-semibold text-foreground">JavaScript Expression</label>
          <Input
            value={(item as any).expression}
            onChange={(e) => onChange({ ...item, expression: e.target.value } as CodebookItem)}
            placeholder="e.g., consent === true, age > 18"
            className={`font-mono text-xs ${expressionError ? "border-destructive" : ""}`}
          />
          {expressionError ? (
            <p className="text-xs text-destructive">{expressionError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Evaluated against variables answered earlier.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
