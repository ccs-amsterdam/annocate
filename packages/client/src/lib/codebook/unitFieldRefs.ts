import {
  allTemplateReferences,
  expandSnippets,
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
 * loop (layout template with its snippets, conditions, question texts), and
 * the `column` of span questions. Warnings, not
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

  const walk = (children: InLoopItem[], snippets: Record<string, string> | undefined) => {
    const text = (source: string | undefined) => templateReferences(expandSnippets(source ?? "", snippets).source).references;
    for (const child of children) {
      if (child.type === "condition") {
        check(itemTitle(child), conditionReferences(child.condition));
        walk(child.children, snippets);
        continue;
      }
      if (child.type === "end") {
        check(child.name, templateReferences(child.message ?? "").references);
        continue;
      }
      const variable = child.variable;
      check(child.name, text(variable.question));
      check(child.name, text(variable.instruction));
      if (variable.type === "span" && !known.has(variable.column)) {
        warn(child.name, variable.column, `${child.name}: column '${variable.column}' is not a unit field`);
      }
    }
  };

  const visit = (list: TopLevelItem[]) => {
    for (const item of list) {
      if (item.type === "condition") visit(item.children);
      if (item.type !== "unit_loop") continue;
      check(itemTitle(item), allTemplateReferences(expandSnippets(item.layout?.template ?? "", item.layout?.snippets).source));
      walk(item.children, item.layout?.snippets);
    }
  };
  visit(items);
  return warnings;
}
