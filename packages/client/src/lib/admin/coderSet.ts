import {
  CODER_SET,
  TEST_SET,
  TEST_SET_TYPES,
  distributeUnits,
  type SetGroupResponse,
  type TestSetType,
  type UnitSet,
} from "@annotinder/contracts";
import { assignWithoutValue, testSetsOf, unitsWithoutValue } from "./setKinds";

// Making the units' coder set from the coder set dialog's choices
// (docs/plans/unit-sets.md): the selected expert coders get the units,
// anew or only the units without a coder.

/** What the dialog works with: the units, the draft's role columns, and what coders already coded. */
export interface CoderSetInput {
  unitIds: number[];
  groups: readonly SetGroupResponse[];
  /** Per coder id, the units they coded. */
  coded: ReadonlyMap<string, readonly number[]>;
}

/** The dialog's choices. */
export interface CoderSetChoices {
  /** The coders who get units. */
  coders: string[];
  /** `anew`: overwrites the coder set; `empty`: gives the units without a coder to the coders, keeping the rest. */
  mode: "anew" | "empty";
  everyone: boolean;
  perUnit: number;
  /** Draws the test units anew (`testCounts` of each type). */
  redistribute: boolean;
  testCounts: Record<TestSetType, number>;
  /** Coders keep the units they coded. */
  keep: boolean;
  seed: number;
}

/** What saving writes: the coder set, and the test set if it is drawn anew (`[]`: none any more). */
export interface CoderSetPlan {
  sets: UnitSet[];
  testSets: UnitSet[] | null;
  /** Unit assignments kept because a coder coded the unit. */
  kept: number;
}

const groupSets = (groups: readonly SetGroupResponse[], name: string) => groups.find((g) => g.name === name)?.sets;

/** How many test units of each type the draft has. */
export function currentTestCounts(groups: readonly SetGroupResponse[]): Record<TestSetType, number> {
  const tests = groupSets(groups, TEST_SET) ?? [];
  return Object.fromEntries(
    TEST_SET_TYPES.map((t) => [t, tests.find((s) => s.name === t)?.unitIds.length ?? 0]),
  ) as Record<TestSetType, number>;
}

/** The coders selected when the dialog opens: those of the draft's coder set, or every expert coder without one. */
export function preselectedCoders(experts: readonly string[], groups: readonly SetGroupResponse[]): string[] {
  const existing = groupSets(groups, CODER_SET);
  if (!existing) return [...experts];
  const inSet = new Set(existing.map((s) => s.name));
  return experts.filter((coder) => inSet.has(coder));
}

/** The units that have no coder and aren't test units. */
export const unitsWithoutCoder = (input: CoderSetInput): number[] =>
  unitsWithoutValue(input.unitIds, [...input.groups], CODER_SET);

/** The units these coders coded, for those who coded any. */
export function codedBy(input: CoderSetInput, coders: readonly string[]): Map<string, readonly number[]> {
  return new Map(coders.flatMap((c) => (input.coded.get(c)?.length ? [[c, input.coded.get(c)!] as const] : [])));
}

/** Why the choices can't be saved, or null if they can. */
export function coderSetProblem(input: CoderSetInput, choices: CoderSetChoices): string | null {
  if (choices.coders.length === 0) return "Select at least one coder.";
  if (input.unitIds.length === 0) return "The study has no units yet: upload them first.";
  if (choices.mode === "empty")
    return unitsWithoutCoder(input).length === 0 ? "Every unit has a coder or is a test unit." : null;
  const tests = TEST_SET_TYPES.reduce((n, t) => n + choices.testCounts[t], 0);
  if (choices.redistribute && tests >= input.unitIds.length)
    return `There are ${input.unitIds.length} units: leave some for the coders.`;
  return null;
}

/** The units without a coder go to the selected coders; every current assignment stays, also of coders not selected. */
function assignEmpty(input: CoderSetInput, choices: CoderSetChoices): CoderSetPlan {
  const existing = groupSets(input.groups, CODER_SET) ?? [];
  const selected = choices.coders.map(
    (name) => existing.find((s) => s.name === name) ?? { name, unitIds: [], ordered: false },
  );
  const given = assignWithoutValue(CODER_SET, selected, unitsWithoutCoder(input), {
    perUnit: choices.everyone ? selected.length : choices.perUnit,
    seed: choices.seed,
  });
  const others = existing.filter((s) => !choices.coders.includes(s.name));
  return { sets: [...others, ...given], testSets: null, kept: 0 };
}

/** The units divided anew over the selected coders. */
function divideAnew(input: CoderSetInput, choices: CoderSetChoices): CoderSetPlan {
  const tests = groupSets(input.groups, TEST_SET);
  const { sets, testUnits, kept } = distributeUnits(input.unitIds, choices.coders, {
    perUnit: choices.everyone ? choices.coders.length : choices.perUnit,
    seed: choices.seed,
    ...(choices.redistribute
      ? { newTestUnits: choices.testCounts }
      : { testUnits: tests?.flatMap((s) => s.unitIds) ?? [] }),
    keep: choices.keep ? codedBy(input, choices.coders) : undefined,
  });
  return {
    sets: sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })),
    testSets: choices.redistribute ? testSetsOf(testUnits) : null,
    kept,
  };
}

/** What the choices make of the units (without coders: nothing). */
export function planCoderSet(input: CoderSetInput, choices: CoderSetChoices): CoderSetPlan {
  if (choices.coders.length === 0) return { sets: [], testSets: null, kept: 0 };
  const existing = groupSets(input.groups, CODER_SET) !== undefined;
  return existing && choices.mode === "empty" ? assignEmpty(input, choices) : divideAnew(input, choices);
}
