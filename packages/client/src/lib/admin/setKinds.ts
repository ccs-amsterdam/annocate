import {
  isEmail,
  isRoleColumn,
  type RoleColumn,
  type SetGroupResponse,
  type TestUnitType,
} from "@annotinder/contracts";

// The units' columns with a role (docs/plans/unit-sets.md): how the
// researcher UI names them and explains what they do.

/** The role columns as people read them. */
export const ROLE_LABELS: Record<RoleColumn, string> = {
  coder_set: "Coder set",
  condition_set: "Condition set",
  part_set: "Part set",
  test_unit: "Test unit",
};

/** What each role column does, for a tooltip. */
export const ROLE_INFO: Record<RoleColumn, string> = {
  coder_set: "Who codes which units (specific coders): per unit the coders' names or email addresses.",
  condition_set: "The units of each condition of the experiment that selects units.",
  part_set: "Parts of the study, e.g. pre and post: a unit loop shows one part.",
  test_unit: "Test units: overlap (coded by everyone), practice (with feedback) and gold (checked silently).",
};

/** A column's label: its role's, or its name. */
export const roleLabel = (name: string) => (isRoleColumn(name) ? ROLE_LABELS[name] : name);

/** The test unit types (`test_unit` values): what each does, for a tooltip. */
export const TEST_UNIT_INFO: Record<TestUnitType, string> = {
  overlap: "Overlap units: every coder gets them, e.g. to compare coders' answers.",
  practice: "Practice units: coded first, with feedback from the right answers.",
  gold: "Gold units: with known right answers, coders are checked on them without noticing.",
};

/** Whether every value of a role column is an email address: coders who sign in. */
export function isEmailColumn(group: SetGroupResponse): boolean {
  const values = group.sets.map((s) => s.name);
  return group.name !== "test_unit" && values.length > 0 && values.every((n) => isEmail(n));
}

export const EMAIL_COLUMN_INFO =
  "Units assigned to email addresses: coders sign in and get the units of their address (authenticated coding).";
