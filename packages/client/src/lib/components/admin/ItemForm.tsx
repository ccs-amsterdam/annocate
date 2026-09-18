import type { CodebookItem, UnitVariableType, UserVariableType } from "@annotinder/contracts";
import type { UnitsetResponse } from "@annotinder/contracts";
import type { NewCodebookItem } from "../../codebook/codebookEdit";
import {
  VariableTypeForm,
  VARIABLE_TYPE_OPTIONS_UNIT,
  VARIABLE_TYPE_OPTIONS_USER,
  defaultVariableForAnyType,
} from "./VariableTypeForm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Item types selectable as a NEW item, keyed by whether the parent is inside a `unit_loop`. */
export const ITEM_TYPE_OPTIONS_TOP = ["user_variable", "unit_loop", "condition"] as const;
export const ITEM_TYPE_OPTIONS_IN_LOOP = ["unit_variable", "condition"] as const;

export function defaultItemForType(type: CodebookItem["type"], name: string): NewCodebookItem {
  switch (type) {
    case "user_variable":
      return { type, name, variable: defaultVariableForAnyType("confirm") as UserVariableType };
    case "unit_variable":
      return { type, name, variable: defaultVariableForAnyType("confirm") as UnitVariableType };
    case "unit_loop":
      return { type, name, unitset: "", layout: { template: "" } };
    case "condition":
      return { type, name, expression: "" };
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
}: {
  item: CodebookItem;
  onChange: (next: CodebookItem) => void;
  unitsets: UnitsetResponse[];
  unitVariableNames: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Name</label>
        <Input
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value } as CodebookItem)}
          pattern="[a-zA-Z0-9_]+"
          title="Alphanumeric and underscores only"
        />
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
            <label className="text-sm font-medium">Unitset</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={item.unitset}
              onChange={(e) => onChange({ ...item, unitset: e.target.value })}
            >
              <option value="">-- select --</option>
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
              onChange={(e) => onChange({ ...item, randomizeUnits: e.target.checked || undefined })}
            />
            Randomize unit order per coder
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Layout template (markdown + {"{{ }}"}/::field/::tokenize)</label>
            <Textarea
              className="min-h-40 font-mono text-xs"
              value={item.layout.template}
              onChange={(e) => onChange({ ...item, layout: { ...item.layout, template: e.target.value } })}
            />
          </div>
          <ConstantsEditor
            constants={item.layout.constants ?? {}}
            onChange={(constants) => onChange({ ...item, layout: { ...item.layout, constants } })}
          />
        </>
      )}

      {item.type === "condition" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Expression (JS boolean, evaluated in QuickJS)</label>
          <Textarea
            className="font-mono text-xs"
            value={item.expression}
            onChange={(e) => onChange({ ...item, expression: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function ConstantsEditor({
  constants,
  onChange,
}: {
  constants: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(constants);
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Layout constants</label>
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="name"
            value={key}
            className="w-32"
            onChange={(e) => {
              const next: Record<string, string> = {};
              entries.forEach(([k, v], j) => {
                next[j === i ? e.target.value : k] = v;
              });
              onChange(next);
            }}
          />
          <Input
            placeholder="value"
            value={value}
            onChange={(e) => onChange({ ...constants, [key]: e.target.value })}
          />
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-destructive"
            onClick={() => {
              const next = { ...constants };
              delete next[key];
              onChange(next);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start text-sm text-primary hover:underline"
        onClick={() => onChange({ ...constants, [`constant_${entries.length + 1}`]: "" })}
      >
        + Add constant
      </button>
    </div>
  );
}
