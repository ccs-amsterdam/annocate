import {
  STUDY_END_NAME,
  effectiveLoopUnits,
  inviteOf,
  sessionItem,
  unitLoops,
  validateVariables,
  type AnyVariableType,
  type DesignItem,
  type EndItem,
  type ResolvedLoopUnits,
  type TopLevelItem,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";

// Lookups on the design items and annotation validation.

export type VariableType = AnyVariableType;
export { validateVariables };

export interface LoopInfo {
  /** The loop's position in the design (contracts `unitLoops`): how the coder API and distribution state refer to it. */
  key: string;
  loop: UnitLoopItem;
  variables: Map<string, VariableType>;
  /** How the loop hands out units: its settings with a crowd's shared queue (contracts `effectiveLoopUnits`). */
  units: ResolvedLoopUnits;
}

export function collectLoops(items: TopLevelItem[]): LoopInfo[] {
  const invite = inviteOf(sessionItem(items));
  const criteria = invite.mode === "crowd" ? invite.share : undefined;
  return unitLoops(items).map(({ key, loop }) => {
    const variables = new Map<string, VariableType>();
    collectQuestions(loop.children as DesignItem[], variables);
    return { key, loop, variables, units: effectiveLoopUnits(loop, criteria) };
  });
}

/** The question a loop with criteria compares for agreement: what distribution needs to know of finished codings. */
export function loopAgreementVariables(info: LoopInfo): string[] {
  const on = info.units.criteria?.until?.on;
  return on ? [on] : [];
}

/**
 * Whether distributing a loop's units depends on every coder's codings
 * (loaded for all coders, not only active ones): shared queues.
 */
function needsAllCodings(info: LoopInfo): boolean {
  return !!info.units.criteria;
}

/**
 * Loops in which these answers finish a unit: every question of the loop
 * (in the current codebook) has a value (docs/architecture.md §8.2).
 */
export function finishedLoops(variables: Record<string, VariableValue>, loops: Iterable<LoopInfo>): LoopInfo[] {
  return [...loops].filter((info) => [...info.variables.keys()].every((name) => name in variables));
}

/**
 * What finished codings derived from annotations depend on: per loop, its
 * questions, whether it has dynamic sources, and their agreement variables.
 * If this doesn't change between design versions, codings can be kept.
 */
export function codingsSignature(loops: Iterable<LoopInfo>): string {
  return JSON.stringify(
    [...loops]
      .map((info) => [
        info.key,
        [...info.variables.keys()].sort(),
        needsAllCodings(info),
        loopAgreementVariables(info).sort(),
      ])
      .sort(),
  );
}

/** Coder-level (non-unit) variables: questions and computed items outside any unit_loop. */
export function collectCoderVariables(items: TopLevelItem[]): Map<string, VariableType> {
  const variables = new Map<string, VariableType>();
  collectQuestions(items, variables);
  return variables;
}

/** The variables of these items (also inside conditions, not inside unit loops), by name. */
function collectQuestions(items: DesignItem[], into: Map<string, VariableType>) {
  for (const item of items) {
    if (item.type === "show_if") collectQuestions(item.children as DesignItem[], into);
    else if (item.type !== "unit_loop" && item.type !== "end" && item.type !== "session")
      into.set(item.name, item.variable);
  }
}

/** The value of a single-valued answer (e.g. a drawn random condition), as text. */
export function valueOf(answer: VariableValue | undefined): string | undefined {
  if (!answer || answer.skip) return undefined;
  const value = answer.values?.[0]?.value;
  return value === undefined ? undefined : String(value);
}

/** A coder variable holding one value, as stored for drawn random conditions. */
export function singleValue(value: string): VariableValue {
  return { done: true, skip: false, values: [{ value }] };
}

/** A canonical string of a variable's answer (its values, per item), used to test agreement between coders. */
export function agreementKey(variables: Record<string, VariableValue>, variable: string): string | null {
  const answer = variables[variable];
  if (!answer || answer.skip || !answer.values?.length) return null;
  return answer.values
    .map((v) => `${v.item ?? ""}:${JSON.stringify(v.value)}`)
    .sort()
    .join("|");
}

/** The `end` item with this name, anywhere in the design; `_end`: the study's normal end (the Study entry's `end`). */
export function findEndItem(items: readonly DesignItem[], name: string): EndItem | null {
  if (name === STUDY_END_NAME) {
    const end = sessionItem(items)?.end;
    return end ? ({ type: "end", name, outcome: "complete", ...end } as EndItem) : null;
  }
  for (const item of items) {
    if (item.type === "end" && item.name === name) return item;
    if ("children" in item) {
      const found = findEndItem(item.children as DesignItem[], name);
      if (found) return found;
    }
  }
  return null;
}
