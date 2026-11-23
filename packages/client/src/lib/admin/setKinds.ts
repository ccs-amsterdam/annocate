import {
  addToSets,
  CODER_SET,
  distributeUnits,
  isEmail,
  isRoleColumn,
  TEST_SET,
  type RoleColumn,
  type SetGroupResponse,
  type TestSetType,
  type UnitSet,
} from "@annotinder/contracts";

// The units' columns with a role (docs/plans/unit-sets.md): how the
// researcher UI names them and explains what they do.

/** The role columns as people read them. */
export const ROLE_LABELS: Record<RoleColumn, string> = {
  coder_set: "Coder set",
  condition_set: "Condition set",
  part_set: "Part set",
  test_set: "Test set",
};

/** What each role column does, for a tooltip. */
export const ROLE_INFO: Record<RoleColumn, string> = {
  coder_set: "Who codes which units (specific coders): per unit the coders' names or email addresses.",
  condition_set: "The units of each condition of the experiment that selects units.",
  part_set: "Parts of the study, e.g. pre and post: a unit loop shows one part.",
  test_set: "Test units: overlap (coded by everyone), practice (with feedback) and gold (checked silently).",
};

/** A column's label: its role's, or its name. */
export const roleLabel = (name: string) => (isRoleColumn(name) ? ROLE_LABELS[name] : name);

/** The test sets (`test_set` values): what each does, for a tooltip. */
export const TEST_SET_INFO: Record<TestSetType, string> = {
  overlap: "Overlap units: every coder gets them, e.g. to compare coders' answers.",
  practice: "Practice units: coded first, with feedback from the right answers.",
  gold: "Gold units: with known right answers, coders are checked on them without noticing.",
};

/** Drawn test units as the test set's sets: practice units in the order drawn (`practice#1`, ...). */
export const testSetsOf = (testUnits: { name: TestSetType; units: number[] }[]) =>
  testUnits.map((s) => ({ name: s.name, unitIds: s.units, ordered: s.name === "practice" }));

export const TEST_LABELS: Record<TestSetType, string> = {
  overlap: "Overlap units",
  practice: "Practice units",
  gold: "Gold units",
};

/** Whether every value of a role column is an email address: coders who sign in. */
export function isEmailColumn(group: SetGroupResponse): boolean {
  const values = group.sets.map((s) => s.name);
  return group.name !== "test_set" && values.length > 0 && values.every((n) => isEmail(n));
}

export const EMAIL_COLUMN_INFO =
  "Units assigned to email addresses: coders sign in and get the units of their address (authenticated coding).";

/**
 * The units "Assign units without a value" gives a set column a value:
 * those with no value in it that aren't test units (in no test set).
 */
export function unitsWithoutValue(unitIds: number[], groups: SetGroupResponse[], column: RoleColumn): number[] {
  const has = new Set(
    [column, TEST_SET].flatMap((name) => groups.find((g) => g.name === name)?.sets.flatMap((s) => s.unitIds) ?? []),
  );
  return unitIds.filter((id) => !has.has(id));
}

/**
 * A set column with `units` (units without a value) added and every current
 * assignment kept, shuffled (seeded). A coder set gives each to `perUnit`
 * coders, those with the fewest units first (`distributeUnits` keeping
 * the coders' units); other columns spread them evenly over their values
 * (`addToSets`). New units go at the end of ordered sets.
 */
export function assignWithoutValue(
  column: RoleColumn,
  sets: UnitSet[],
  units: number[],
  options: { perUnit?: number; seed?: number } = {},
): UnitSet[] {
  if (column !== CODER_SET) return addToSets(sets, units, "distribute", options.seed);
  const coders = sets.map((s) => s.name);
  const given = distributeUnits([...sets.flatMap((s) => s.unitIds), ...units], coders, {
    perUnit: options.perUnit,
    seed: options.seed,
    keep: new Map(sets.map((s) => [s.name, s.unitIds])),
  }).sets;
  // Only the new units: units with fewer coders than `perUnit` keep theirs
  const added = new Set(units);
  return sets.map((s, i) => ({ ...s, unitIds: [...s.unitIds, ...given[i].units.filter((id) => added.has(id))] }));
}
