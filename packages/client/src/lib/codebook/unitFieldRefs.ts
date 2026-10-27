import {
  extractReferences,
  templateReferences,
  type Condition,
  type InLoopItem,
  type Reference,
  type TopLevelItem,
  type UnitField,
} from "@annotinder/contracts";
import { itemTitle } from "./conditions";

export interface UnitFieldWarning {
  /** The item that refers to the field (the loop itself for its layout). */
  item: string;
  field: string;
  message: string;
}

/** References in a condition's script. */
function conditionReferences(condition: Condition | undefined): Reference[] {
  return condition ? extractReferences(condition.script).references : [];
}

/**
 * References to unit fields that don't exist: `$unit.x` anywhere in a unit
 * loop (layout template, conditions, question texts), and the `column` of
 * span questions (which may also name a layout constant). Warnings, not
 * errors: units may still be uploaded after the codebook is written.
 * Nothing to check while the job has no units (`fields` empty).
 */
export function unknownUnitFields(items: TopLevelItem[], fields: UnitField[]): UnitFieldWarning[] {
  if (fields.length === 0) return [];
  const known = new Set(fields.map((f) => f.name));
  const warnings: UnitFieldWarning[] = [];
  const seen = new Set<string>();
  const warn = (item: string, field: string, message: string) => {
    const key = `${item}/${field}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ item, field, message });
  };
  const check = (item: string, refs: Reference[]) => {
    for (const ref of refs) {
      if (ref.ns === "unit" && !known.has(ref.path[0])) warn(item, ref.path[0], `${item}: $unit.${ref.path[0]} is not a unit field`);
    }
  };

  const walk = (children: InLoopItem[], constants: Set<string>) => {
    for (const child of children) {
      if (child.type === "condition") {
        check(itemTitle(child), conditionReferences(child.condition));
        walk(child.children, constants);
        continue;
      }
      if (child.type === "end") {
        check(child.name, templateReferences(child.message ?? "").references);
        continue;
      }
      const variable = child.variable;
      check(child.name, templateReferences(variable.question ?? "").references);
      check(child.name, templateReferences(variable.instruction ?? "").references);
      if (variable.type === "span" && !known.has(variable.column) && !constants.has(variable.column)) {
        warn(child.name, variable.column, `${child.name}: column '${variable.column}' is not a unit field`);
      }
    }
  };

  const visit = (list: TopLevelItem[]) => {
    for (const item of list) {
      if (item.type === "condition") visit(item.children);
      if (item.type !== "unit_loop") continue;
      check(item.name, templateReferences(item.layout?.template ?? "").references);
      walk(item.children, new Set(Object.keys(item.layout?.constants ?? {})));
    }
  };
  visit(items);
  return warnings;
}
