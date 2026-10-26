import type { AnyVariableType } from "./variableTypes.js";
import type { VariableValue } from "../variableValue.js";
import { questionKind, questionValues } from "./references.js";

// Checks answers against the *current* codebook. Shared by the server
// (rejects invalid submissions) and the client (treats answers that no longer
// fit an updated codebook as unanswered, so the question is asked again; see
// docs/architecture.md §8).

export type { AnyVariableType } from "./variableTypes.js";

/** Whether `value` is on a numeric question's grid: within min..max, a multiple of `step` from `min` (or 0). */
export function numericValueError(variable: { min?: number; max?: number; step?: number }, value: number): string | null {
  if (!Number.isFinite(value)) return "not a number";
  if (variable.min !== undefined && value < variable.min) return `below the minimum ${variable.min}`;
  if (variable.max !== undefined && value > variable.max) return `above the maximum ${variable.max}`;
  const step = variable.step ?? 1;
  const steps = (value - (variable.min ?? 0)) / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return `not a multiple of ${step}${variable.min ? ` from ${variable.min}` : ""}`;
  return null;
}

/** Problems with one answer for one variable; empty means valid. */
export function validateAnswer(name: string, variable: AnyVariableType, value: VariableValue): string[] {
  const errors: string[] = [];
  if (value.skip) return errors;
  const kind = questionKind(variable);
  const values = variable.type === "auto" && !variable.options?.length ? undefined : questionValues(variable);
  const allowed = values ? new Set<unknown>(values) : null;
  const answers = value.values ?? [];

  if (answers.length > 0 && (kind === "span" || kind === "relation" || kind === "confirm")) {
    errors.push(`'${name}': values given for a ${variable.type} variable`);
  }
  if ((value.spans?.length ?? 0) > 0 && variable.type !== "span") errors.push(`'${name}': spans given for a ${variable.type} variable`);
  if ((value.relations?.length ?? 0) > 0 && variable.type !== "relation") {
    errors.push(`'${name}': relations given for a ${variable.type} variable`);
  }

  if (variable.type === "scale") {
    const items = new Set(variable.items.map((i) => i.name));
    const seen = new Set<string>();
    for (const answer of answers) {
      if (answer.item === undefined || !items.has(answer.item)) errors.push(`'${name}': unknown item '${answer.item ?? ""}'`);
      else if (seen.has(answer.item)) errors.push(`'${name}': more than one answer for item '${answer.item}'`);
      else seen.add(answer.item);
    }
  } else if (answers.some((a) => a.item !== undefined)) {
    errors.push(`'${name}': items given for a question without items`);
  }
  if (kind !== "multiple" && kind !== "scale" && answers.length > 1) errors.push(`'${name}': only one answer allowed`);

  for (const answer of answers) {
    if (variable.type === "numeric") {
      const problem = typeof answer.value === "number" ? numericValueError(variable, answer.value) : "not a number";
      if (problem) errors.push(`'${name}': ${JSON.stringify(answer.value)} is ${problem}`);
    } else if (allowed && !allowed.has(answer.value)) {
      errors.push(`'${name}': unknown value ${JSON.stringify(answer.value)}`);
    }
  }
  for (const span of value.spans ?? []) {
    if (allowed && !allowed.has(span.value)) errors.push(`'${name}': unknown span value '${span.value}'`);
  }
  for (const relation of value.relations ?? []) {
    if (allowed && !allowed.has(relation.value)) errors.push(`'${name}': unknown relation value '${relation.value}'`);
  }
  return errors;
}

/** Problems with a set of answers, given the variables that may be answered; empty means valid. */
export function validateVariables(
  allowed: Map<string, AnyVariableType>,
  variables: Record<string, VariableValue>,
): string[] {
  return Object.entries(variables).flatMap(([name, value]) => {
    const variable = allowed.get(name);
    return variable ? validateAnswer(name, variable, value) : [`Unknown variable '${name}'`];
  });
}
