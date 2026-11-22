import { GOLD_SET, OVERLAP_SET, PRACTICE_SET, isEmail, type SetGroupResponse } from "@annotinder/contracts";

/** The special values of a set column (`_overlap`, `_practice`, `_gold`): what each does, for a tooltip. */
export const SPECIAL_SET_INFO: Record<string, string> = {
  [OVERLAP_SET]: "Special set: units every coder of this column gets, e.g. to compare coders' answers.",
  [PRACTICE_SET]: "Special set: practice units, coded first, with feedback from the right answers.",
  [GOLD_SET]: "Special set: gold units, with known right answers: coders are checked on them without noticing.",
};

export const isSpecialSet = (name: string) => name.startsWith("_");

/** Whether every value of a set column (special ones aside) is an email address: coders who sign in. */
export function isEmailColumn(group: SetGroupResponse): boolean {
  const values = group.sets.map((s) => s.name).filter((n) => !isSpecialSet(n));
  return values.length > 0 && values.every((n) => isEmail(n));
}

export const EMAIL_COLUMN_INFO =
  "A column of units assigned to email addresses: coders sign in and get the units of their address (authenticated coding).";
