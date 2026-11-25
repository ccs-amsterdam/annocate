import type { CoderKind, CoderResponse, Invite, LinkResponse, UnassignedUnits } from "@annotinder/contracts";

// The Coders page's table (docs/client.md §7, "Coders"): which coders and
// columns it shows, and its order.

/** The table's columns, by the coder's field they show. */
export type CoderColumn = "coder" | "email" | "assigned" | "assignedDraft" | "done" | "remaining" | "lastActive";

export const CODER_COLUMN_LABELS: Record<CoderColumn, string> = {
  coder: "Coder",
  email: "Email",
  assigned: "Assigned (current)",
  assignedDraft: "Assigned (draft)",
  done: "Done",
  remaining: "Remaining",
  lastActive: "Last active",
};

/** A crowd's coders have no address and no units of their own: those columns are the expert coders'. */
const COLUMNS: Record<CoderKind, CoderColumn[]> = {
  expert: ["coder", "email", "assigned", "assignedDraft", "done", "remaining", "lastActive"],
  crowd: ["coder", "done", "lastActive"],
};

export const coderColumns = (kind: CoderKind): CoderColumn[] => COLUMNS[kind];

/** The kind of coder a study's invitation asks for: expert coders, else a crowd (also before it is chosen). */
export const invitedKind = (invite: Invite | null): CoderKind => (invite?.mode === "coders" ? "expert" : "crowd");

/** The coders of one kind. */
export const codersOfKind = (coders: readonly CoderResponse[], kind: CoderKind): CoderResponse[] =>
  coders.filter((c) => c.kind === kind);

/** The table's order: a column, upwards or downwards. */
export interface CoderSort {
  column: CoderColumn;
  descending: boolean;
}

/** Who has the most left to do first. */
export const DEFAULT_CODER_SORT: CoderSort = { column: "remaining", descending: true };

const TEXT_COLUMNS: CoderColumn[] = ["coder", "email"];

/** The order after a click on a column's header: the other way round, or a new column (texts A to Z, numbers and dates highest first). */
export function nextSort(current: CoderSort, column: CoderColumn): CoderSort {
  if (current.column === column) return { column, descending: !current.descending };
  return { column, descending: !TEXT_COLUMNS.includes(column) };
}

/** A coder's value in a column, to compare: a text, a number, or null without one. */
function sortValue(coder: CoderResponse, column: CoderColumn): string | number | null {
  const value = coder[column];
  if (value === null) return null;
  if (column === "lastActive") return new Date(value).getTime();
  return typeof value === "string" ? value.toLowerCase() : (value as number);
}

const compare = (a: string | number, b: string | number) =>
  typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);

/** The coders in the table's order. Coders without a value come last either way; equal ones are in the order of their ids. */
export function sortCoders(coders: readonly CoderResponse[], sort: CoderSort): CoderResponse[] {
  const direction = sort.descending ? -1 : 1;
  return [...coders].sort((a, b) => {
    const [x, y] = [sortValue(a, sort.column), sortValue(b, sort.column)];
    if (x === null || y === null) return Number(x === null) - Number(y === null) || a.coder.localeCompare(b.coder);
    return direction * compare(x, y) || a.coder.localeCompare(b.coder);
  });
}

/** A coder's own link (expert coders with a link each): the link the deployed design makes for them, if any. */
export function linkOfCoder(links: readonly LinkResponse[], coder: string): LinkResponse | undefined {
  return links.find((l) => l.retiredAt === null && l.params.coder === coder);
}

const DIVIDE = "Divide them over the coders (Make coder set), then deploy the units.";

/**
 * What to say about units without a coder, and what to do about it; null
 * when every unit has one (or the study has no expert coders).
 */
export function unassignedText(unassigned: UnassignedUnits, kind: CoderKind): string | null {
  if (kind !== "expert") return null;
  const units = (n: number) => `${n} unit${n === 1 ? " has" : "s have"} no coder`;
  const live = unassigned.live ?? 0;
  if (live > 0 && unassigned.draft > 0) {
    const where =
      live === unassigned.draft
        ? `${units(live)}, deployed and in the draft`
        : `${units(live)} among the deployed units, and ${unassigned.draft} in the draft`;
    return `${where}: nobody codes them. ${DIVIDE}`;
  }
  if (live > 0)
    return `${units(live)} among the deployed units: nobody codes them. The draft gives every unit a coder: deploy the units to apply it.`;
  if (unassigned.draft > 0) return `${units(unassigned.draft)} in the draft. ${DIVIDE}`;
  return null;
}
