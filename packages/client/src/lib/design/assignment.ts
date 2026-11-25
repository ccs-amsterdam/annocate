import { CODER_SET, CONDITION_SET, type Invite, type RoleColumn, type SetGroupResponse } from "@annotinder/contracts";

// Who gets which units (docs/architecture.md §6, docs/plans/unit-sets.md),
// as the editor shows it: expert coders by the units' `coder_set`, and the
// experiment that selects units by `condition_set`, checked against the
// draft units' columns with a role.

/** A role column's values (its sets). */
export function columnValues(groups: readonly SetGroupResponse[], column: string): string[] {
  return (groups.find((g) => g.name === column)?.sets ?? []).map((s) => s.name);
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

/** What selects a session's units: its coder, and the experiment that selects units. */
export interface ShareSource {
  /** How the editor names it, e.g. "coder" or "framing". */
  label: string;
  column: RoleColumn;
  /** Assigned in the flow (an experiment's condition), not at the start. */
  inFlow?: boolean;
}

/** The share's sources: expert coders (`coder_set`), and the experiment that selects units (`condition_set`). */
export function shareSources(
  invite: Invite | undefined,
  experiments: readonly { name: string; selectsUnits?: boolean }[] = [],
): ShareSource[] {
  const out: ShareSource[] = [];
  if (invite?.mode === "coders") out.push({ label: "coder", column: CODER_SET });
  const selecting = experiments.find((c) => c.selectsUnits);
  if (selecting) out.push({ label: selecting.name, column: CONDITION_SET, inFlow: true });
  return out;
}

/** What the loop's Units settings need to know of the rest of the design. */
export interface LoopUnitsContext {
  /** Who codes (null: not chosen yet). */
  invite: Invite | null;
  /** What selects a session's units (its coder, the experiment's condition). */
  sources: ShareSource[];
  /** The loops before this one, in design order: the last is the one whose units this loop can take. */
  earlier: { title: string }[];
}

/** A loop's units in one line: whose they are, and the loop's part. */
export function shareSummary(sources: readonly ShareSource[], part?: string): string {
  const whose =
    sources.length === 0
      ? "A session gets all units"
      : `A session gets the units of its ${sources.map((s) => s.label).join(" × ")}`;
  if (part === undefined) return `${whose}.`;
  return `${whose}; this loop only those of part “${part}”.`;
}
