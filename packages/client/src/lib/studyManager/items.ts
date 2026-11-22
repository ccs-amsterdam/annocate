import type {
  AnyVariableType,
  CoderUnitLoopItem,
  EndItem,
  InLoopItem,
  TopLevelItem,
  VariableValue,
} from "@annotinder/contracts";
import { validateAnswer } from "@annotinder/contracts";
import { flattenTree } from "../codebook/tree";

// Lookups in the coder codebook that StudyManager needs.

/** The questions of a loop (also inside conditions) by name. */
export function loopVariables(loop: CoderUnitLoopItem): Map<string, AnyVariableType> {
  const result = new Map<string, AnyVariableType>();
  const walk = (items: InLoopItem[]) => {
    for (const item of items) {
      if (item.type === "block") walk([...item.children, ...(item.elseChildren ?? [])]);
      else if (item.type === "question") result.set(item.name, item.variable);
    }
  };
  walk(loop.children);
  return result;
}

/** A loop's question names in codebook order (also inside conditions), for `::: from` blocks in its layout. */
export function loopQuestionNames(loop: CoderUnitLoopItem): string[] {
  return flattenTree(loop.children).flatMap((item) => (item.type === "question" ? [item.name] : []));
}

/**
 * The answers that still fit the current codebook. Answers to removed
 * questions, or with codes a question no longer has, are left out, so the
 * coder is asked again (docs/architecture.md §8).
 */
export function currentAnswers(
  answers: Record<string, VariableValue>,
  variables: Map<string, AnyVariableType>,
): Record<string, VariableValue> {
  return Object.fromEntries(
    Object.entries(answers).filter(([name, value]) => {
      const variable = variables.get(name);
      return variable !== undefined && validateAnswer(name, variable, value).length === 0;
    }),
  );
}

/** The `end` item with this name (where a session ended); null if the codebook no longer has it. */
export function findEnd(items: (TopLevelItem | InLoopItem)[], name: string): EndItem | null {
  for (const item of items) {
    if (item.type === "end" && item.name === name) return item;
    if ("children" in item) {
      const found = findEnd(item.children as (TopLevelItem | InLoopItem)[], name);
      if (found) return found;
    }
  }
  return null;
}
