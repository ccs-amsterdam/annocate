import type {
  AnyVariableType,
  CoderUnitLoopItem,
  EndItem,
  InLoopItem,
  TopLevelItem,
  VariableValue,
} from "@annotinder/contracts";
import { resolveVariable, ruleVariables, validateVariables } from "@annotinder/contracts";
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
 * The answers that still fit the current codebook, and each other. Answers
 * to removed questions, with codes a question no longer has, or that build
 * on a span that isn't there (a relation, an option from spans) are left
 * out, so the coder is asked again (docs/architecture.md §8). These are the
 * answers the server accepts (it checks them the same way).
 */
export function currentAnswers(
  answers: Record<string, VariableValue>,
  variables: Map<string, AnyVariableType>,
  unit?: Record<string, unknown> | null,
): Record<string, VariableValue> {
  // An answer left out can be one another builds on: until all that are left fit
  for (let kept = answers; ;) {
    const fitting = fittingAnswers(kept, variables, unit);
    if (Object.keys(fitting).length === Object.keys(kept).length) return fitting;
    kept = fitting;
  }
}

function fittingAnswers(
  answers: Record<string, VariableValue>,
  variables: Map<string, AnyVariableType>,
  unit?: Record<string, unknown> | null,
): Record<string, VariableValue> {
  // Options from data: as the unit (and its answers) give them
  const ctx = { unit, answers, questions: variables };
  const types = new Map([...variables].map(([name, variable]) => [name, resolveVariable(variable, ctx)]));
  return Object.fromEntries(Object.entries(answers).filter(([name]) => fits(name, types, answers)));
}

/** Whether an answer fits its question; a relation answer is checked with the span answers it goes between. */
function fits(name: string, types: Map<string, AnyVariableType>, answers: Record<string, VariableValue>): boolean {
  const variable = types.get(name);
  if (!variable) return false;
  const between = variable.type === "relation" && !answers[name].skip ? ruleVariables(variable.rules) : [];
  const checked = [...between, name].flatMap((question) => (answers[question] ? [[question, answers[question]]] : []));
  return validateVariables(types, Object.fromEntries(checked)).length === 0;
}

/** The `end` item with this name (where a session ended); null if the codebook no longer has it. */
export function findEnd(items: (TopLevelItem | InLoopItem)[], name: string): EndItem | null {
  return flattenTree(items).find((item): item is EndItem => item.type === "end" && item.name === name) ?? null;
}
