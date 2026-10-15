import {
  validateVariables,
  type AnyVariableType,
  type CodebookItem,
  type TopLevelItem,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";

// Codebook-derived lookups and annotation validation. Validation lives here
// (not in the db server) so db servers in any language only need to check
// the annotation's shape, never run codebook logic.

export type VariableType = AnyVariableType;
export { validateVariables };

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

/** The agreement variables of all dynamic sources: what distribution needs to know of finished codings. */
export function collectAgreementVariables(loops: Iterable<LoopInfo>): Set<string> {
  const variables = new Set<string>();
  for (const { loop } of loops) {
    for (const branch of loop.units) {
      for (const source of branch.sources) {
        const variable = source.dynamic?.agreement?.variable;
        if (variable) variables.add(variable);
      }
    }
  }
  return variables;
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
