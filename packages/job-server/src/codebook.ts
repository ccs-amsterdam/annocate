import {
  type CodebookItem,
  type TopLevelItem,
  type UnitLoopItem,
  type UnitVariableType,
  type UserVariableType,
  type VariableValue,
} from "@annotinder/contracts";

// Codebook-derived lookups and annotation validation. Validation lives here
// (not in the db server) so db servers in any language only need to check
// the annotation's shape, never run codebook logic.

export type VariableType = UnitVariableType | UserVariableType;

export interface LoopInfo {
  loop: UnitLoopItem;
  variables: Map<string, VariableType>;
}

export function collectLoops(items: TopLevelItem[]): LoopInfo[] {
  const loops: LoopInfo[] = [];
  const walk = (list: TopLevelItem[]) => {
    for (const item of list) {
      if (item.type === "unit_loop") {
        const variables = new Map<string, VariableType>();
        collectQuestions(item.children as CodebookItem[], variables);
        loops.push({ loop: item, variables });
      } else if (item.type === "condition") {
        walk(item.children);
      }
    }
  };
  walk(items);
  return loops;
}

/** Coder-level (non-unit) variables: questions outside any unit_loop. */
export function collectCoderVariables(items: TopLevelItem[]): Map<string, VariableType> {
  const variables = new Map<string, VariableType>();
  const walk = (list: TopLevelItem[]) => {
    for (const item of list) {
      if (item.type === "condition") walk(item.children);
      else if (item.type !== "unit_loop") variables.set(item.name, item.variable);
    }
  };
  walk(items);
  return variables;
}

function collectQuestions(items: CodebookItem[], into: Map<string, VariableType>) {
  for (const item of items) {
    if (item.type === "condition") collectQuestions(item.children as CodebookItem[], into);
    else if (item.type !== "unit_loop") into.set(item.name, item.variable);
  }
}

/** Returns a list of problems; empty means valid. */
export function validateVariables(
  allowed: Map<string, VariableType>,
  variables: Record<string, VariableValue>,
): string[] {
  const errors: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    const variable = allowed.get(name);
    if (!variable) {
      errors.push(`Unknown variable '${name}'`);
      continue;
    }
    if (value.skip) continue;

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
  }
  return errors;
}

function allowedCodes(variable: VariableType): Set<string> | null {
  if (variable.type === "auto") return variable.options ? new Set(variable.options.map((o) => o.code)) : null;
  if ("codes" in variable) return new Set(variable.codes.map((c) => c.code));
  return null;
}

/** The code of a single-valued answer (what `when` conditions and `{placeholders}` compare against). */
export function codeOf(value: VariableValue | undefined): string | undefined {
  if (!value || value.skip) return undefined;
  return value.codes?.[0]?.code;
}

/** variable name -> code, for all single-coded coder variables. */
export function variableCodes(variables: Record<string, VariableValue>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, codeOf(value)]));
}

/** A coder variable value holding one code, as stored for assigned `auto` variables. */
export function codeValue(code: string): VariableValue {
  return { done: true, skip: false, codes: [{ code }] };
}

/** A canonical string of a variable's answer, used to test agreement between coders. */
export function agreementKey(variables: Record<string, VariableValue>, variable: string): string | null {
  const value = variables[variable];
  if (!value || value.skip || !value.codes?.length) return null;
  return value.codes
    .map((c) => `${c.item ?? ""}:${c.code ?? ""}:${c.value ?? ""}`)
    .sort()
    .join("|");
}

export function isDone(variables: Record<string, VariableValue>): boolean {
  const values = Object.values(variables);
  return values.length > 0 && values.every((v) => v.done);
}
