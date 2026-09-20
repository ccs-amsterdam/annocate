import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitsetResponse,
  UserVariableType,
  UnitVariableType,
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

export const ITEM_TYPE_OPTIONS_TOP: CodebookItem["type"][] = ["user_variable", "unit_loop", "condition"];
export const ITEM_TYPE_OPTIONS_IN_LOOP: CodebookItem["type"][] = ["unit_variable", "condition"];

export function defaultItemForType(
  type: CodebookItem["type"],
  name: string,
  inLoop = false,
  childName?: string,
): CodebookItem {
  const qName = childName || `${name}_q1`;
  switch (type) {
    case "user_variable":
      return { type, name, variable: defaultVariableForAnyType("confirm") as UserVariableType };
    case "unit_variable":
      return { type, name, variable: defaultVariableForAnyType("confirm") as UnitVariableType };
    case "unit_loop":
      return {
        type,
        name,
        layout: { template: "" },
        children: [
          {
            type: "unit_variable",
            name: qName,
            variable: defaultVariableForAnyType("confirm") as UnitVariableType,
          },
        ],
      };
    case "condition":
      if (inLoop) {
        const inLoopCond: InLoopItem = {
          type: "condition",
          name,
          expression: "true",
          children: [
            {
              type: "unit_variable",
              name: qName,
              variable: defaultVariableForAnyType("confirm") as UnitVariableType,
            },
          ],
        };
        return inLoopCond;
      } else {
        const topCond: TopLevelItem = {
          type: "condition",
          name,
          expression: "true",
          children: [
            {
              type: "user_variable",
              name: qName,
              variable: defaultVariableForAnyType("confirm") as UserVariableType,
            },
          ],
        };
        return topCond;
      }
  }
}

/**
 * Renders the type-specific edit form for one codebook item (design plan
 * §5.2). A thin dispatcher over `item.type`, delegating to `VariableTypeForm`
 * for `user_variable`/`unit_variable`'s nested `variable` field.
 */
export function ItemForm({
  item,
  onChange,
  unitsets,
  unitVariableNames,
  validationIssues = [],
}: {
  item: CodebookItem;
  onChange: (next: CodebookItem) => void;
  unitsets: UnitsetResponse[];
  unitVariableNames: string[];
  validationIssues?: CodebookValidationIssue[];
}) {
  const nameIssue = validationIssues.find((i) => i.path[i.path.length - 1] === "name");
  const otherIssues = validationIssues.filter((i) => i.path[i.path.length - 1] !== "name");

  return (
    <div className="flex flex-col gap-3">
      {otherIssues.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1">
          {otherIssues.map((issue, idx) => (
            <p key={idx}>• {issue.message}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Name</label>
        <Input
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value } as CodebookItem)}
          pattern="[a-zA-Z0-9_.-]+"
          title="Alphanumeric, underscores, hyphens, dots only"
          className={nameIssue ? "border-destructive focus-visible:ring-destructive" : ""}
          placeholder="e.g. sentiment"
        />
        {nameIssue && (
          <p className="text-xs font-medium text-destructive mt-0.5">{nameIssue.message}</p>
        )}
      </div>

      {(item.type === "user_variable" || item.type === "unit_variable") && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Answer type</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={item.variable.type}
              onChange={(e) =>
                onChange({ ...item, variable: defaultVariableForAnyType(e.target.value) } as CodebookItem)
              }
            >
              {(item.type === "user_variable" ? VARIABLE_TYPE_OPTIONS_USER : VARIABLE_TYPE_OPTIONS_UNIT).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <VariableTypeForm
            variable={item.variable}
            unitVariableNames={unitVariableNames}
            onChange={(variable) => onChange({ ...item, variable } as CodebookItem)}
          />
        </>
      )}

      {item.type === "unit_loop" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Unitset (optional)</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={item.unitset ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  unitset: e.target.value ? e.target.value : undefined,
                } as CodebookItem)
              }
            >
              <option value="">All units (default)</option>
              {unitsets.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!item.randomizeUnits}
              onChange={(e) => onChange({ ...item, randomizeUnits: e.target.checked || undefined } as CodebookItem)}
            />
            Randomize unit order per coder
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Layout template (markdown + {"{{ }}"}/::field/::tokenize)</label>
            <Textarea
              value={item.layout.template}
              onChange={(e) =>
                onChange({
                  ...item,
                  layout: { ...item.layout, template: e.target.value },
                } as CodebookItem)
              }
              rows={5}
              placeholder="e.g. # {{$unit.headline}}\n\n{{$unit.text}}"
            />
          </div>
        </>
      )}

      {item.type === "condition" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Condition expression (JavaScript boolean expression)</label>
          <Input
            value={item.expression}
            onChange={(e) => onChange({ ...item, expression: e.target.value } as CodebookItem)}
            placeholder="e.g. consent === true"
            className="font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
