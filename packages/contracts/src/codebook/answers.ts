import type { UnitVariableType, UserVariableType } from "./variableTypes.js";
import type { VariableValue } from "../variableValue.js";

// Checks answers against the *current* codebook. Shared by the job server
// (rejects invalid submissions) and the client (treats answers that no longer
// fit an updated codebook as unanswered, so the question is asked again; see
// docs/architecture.md §8).

export type AnyVariableType = UnitVariableType | UserVariableType;

/** Problems with one answer for one variable; empty means valid. */
export function validateAnswer(name: string, variable: AnyVariableType, value: VariableValue): string[] {
  const errors: string[] = [];
  if (value.skip) return errors;

  const codes = allowedCodes(variable);
  const items = "items" in variable && variable.items ? new Set(variable.items.map((i) => i.name)) : null;
  for (const answer of value.codes ?? []) {
    if (codes && answer.code !== undefined && !codes.has(answer.code)) {
      errors.push(`'${name}': unknown code '${answer.code}'`);
    }
    if (items && answer.item !== undefined && !items.has(answer.item)) {
      errors.push(`'${name}': unknown item '${answer.item}'`);
    }
  }
  if ((value.spans?.length ?? 0) > 0 && variable.type !== "span") {
    errors.push(`'${name}': spans given for a ${variable.type} variable`);
  }
  if ((value.relations?.length ?? 0) > 0 && variable.type !== "relation") {
    errors.push(`'${name}': relations given for a ${variable.type} variable`);
  }
  for (const span of value.spans ?? []) {
    if (codes && !codes.has(span.code)) errors.push(`'${name}': unknown span code '${span.code}'`);
  }
  for (const relation of value.relations ?? []) {
    if (codes && !codes.has(relation.code)) errors.push(`'${name}': unknown relation code '${relation.code}'`);
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

function allowedCodes(variable: AnyVariableType): Set<string> | null {
  if (variable.type === "auto") return variable.options ? new Set(variable.options.map((o) => o.code)) : null;
  if ("codes" in variable) return new Set(variable.codes.map((c) => c.code));
  return null;
}
