import type {
  AnyVariableType,
  CoderUnitLoopItem,
  EndItem,
  InLoopItem,
  TopLevelItem,
  VariableValue,
} from "@annotinder/contracts";
import { resolveVariable, validateAnswer } from "@annotinder/contracts";
import { flattenTree } from "../codebook/tree";

// Lookups in the coder codebook that StudyManager needs.

/** The questions of a loop (also inside branches) by name. */
export function loopVariables(loop: CoderUnitLoopItem): Map<string, AnyVariableType> {
  return new Map(
    flattenTree(loop.children).flatMap((item) => (item.type === "question" ? [[item.name, item.variable]] : [])),
  );
}

/** A loop's question names in codebook order (also inside branches), for `::: from` blocks in its layout. */
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
  unit?: Record<string, unknown> | null,
): Record<string, VariableValue> {
  // Options from data: as the unit (and its answers) give them
  const ctx = { unit, answers, questions: variables };
  return Object.fromEntries(
    Object.entries(answers).filter(([name, value]) => {
      const variable = variables.get(name);
      return variable !== undefined && validateAnswer(name, resolveVariable(variable, ctx), value).length === 0;
    }),
  );
}

/** The `end` item with this name (where a session ended); null if the codebook no longer has it. */
export function findEnd(items: (TopLevelItem | InLoopItem)[], name: string): EndItem | null {
  return flattenTree(items).find((item): item is EndItem => item.type === "end" && item.name === name) ?? null;
}
