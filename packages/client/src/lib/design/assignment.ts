import { ALL_UNITS_SET, RESERVED_SETS, type Invite, type SetGroupResponse } from "@annotinder/contracts";

// Who gets which units (docs/architecture.md §6), as the editor shows
// it: the coder invitation's coders and the computed items linked to a set
// column, checked against the draft units' set columns.

/** A set column's values (its sets), without the special ones (`_overlap`, `_gold`, `_practice`). */
export function columnValues(groups: readonly SetGroupResponse[], column: string): string[] {
  const special = new Set<string>(RESERVED_SETS);
  return (groups.find((g) => g.name === column)?.sets ?? []).map((s) => s.name).filter((n) => !special.has(n));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How coders get in: every value an email address (one link, sign in), none (a link per coder), or a mix (an error). */
type CoderKind = "emails" | "names" | "mixed" | "none";

export interface CoderSummary {
  kind: CoderKind;
  count: number;
  /** For a mix: the values that aren't email addresses. */
  notEmails: string[];
}

export function coderSummary(values: readonly string[]): CoderSummary {
  const emails = values.filter((v) => EMAIL.test(v));
  if (values.length === 0) return { kind: "none", count: 0, notEmails: [] };
  if (emails.length === values.length) return { kind: "emails", count: values.length, notEmails: [] };
  if (emails.length === 0) return { kind: "names", count: values.length, notEmails: [] };
  return { kind: "mixed", count: values.length, notEmails: values.filter((v) => !EMAIL.test(v)) };
}

/** What selects a session's units: its coder and the conditions linked to a set column. */
export interface ShareSource {
  /** How the editor names it, e.g. "coder" or "framing". */
  label: string;
  column: string;
  /** Drawn in the flow (a random condition), not at the start. */
  inFlow?: boolean;
}

/** The share's sources: the invitation's coders, and the random computed items linked to units. */
export function shareSources(
  invite: Invite | undefined,
  randomConditions: readonly { name: string; units?: string }[] = [],
): ShareSource[] {
  const out: ShareSource[] = [];
  if (invite?.mode === "coders") out.push({ label: "coder", column: invite.column });
  for (const c of randomConditions) if (c.units) out.push({ label: c.name, column: c.units, inFlow: true });
  return out;
}

/** A loop's units in one line: whose they are, and the loop's filter. */
export function shareSummary(
  sources: readonly ShareSource[],
  filter?: { column: string; only?: string[]; except?: string[] },
): string {
  const whose =
    sources.length === 0
      ? "A session gets all units"
      : `A session gets the units of its ${sources.map((s) => s.label).join(" × ")}`;
  if (!filter) return `${whose}, and codes them all.`;
  const values = (filter.only ?? filter.except ?? [])
    .filter(Boolean)
    .map((v) => `“${v}”`)
    .join(", ");
  return `${whose}; this loop ${filter.only ? "only" : "all except"} those with ${values || "(no value yet)"} in ${filter.column}.`;
}

/** The values of a set column with their number of units (the special ones last). */
export function valueCounts(
  groups: readonly SetGroupResponse[],
  column: string,
): { value: string; count: number; special: boolean }[] {
  const special = new Set<string>(RESERVED_SETS);
  const sets = groups.find((g) => g.name === column)?.sets ?? [];
  return sets
    .map((s) => ({ value: s.name, count: s.unitIds.length, special: special.has(s.name) }))
    .sort((a, b) => Number(a.special) - Number(b.special));
}

/**
 * A share's key from the server's progress (`coder=anna,framing=control |
 * phase only post | overlap`) as people read it: "anna · framing control,
 * only post".
 */
export function shareLabel(key: string): string {
  if (key === ALL_UNITS_SET) return "all units";
  const [values, ...rest] = key.split(" | ");
  const who =
    values === "all"
      ? "all units"
      : values
          .split(",")
          .map((pair) => pair.split("="))
          .map(([column, value]) => (column === "coder" ? value : `${column} ${value}`))
          .join(" · ");
  const filter = rest.find((r) => / (only|except) /.test(r));
  return filter ? `${who}, ${filter.replace(/^\S+ /, "")}` : who;
}
