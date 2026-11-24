// The column names of the data download (the client's annotations.csv and
// coders.csv). A question becomes a column named after it, next to the
// columns below, so design validation refuses question names that would
// collide with them (`reservedColumnName`). The download's header builders
// use these lists, so the two can't drift apart.

/** The version of the download's layout (file names and column names), written in its README. */
export const EXPORT_FORMAT_VERSION = 1;

/** annotations.csv: the columns before the questions' (a row per unit and coder). */
export const ANNOTATION_COLUMNS = [
  "unit_id",
  "unit_version_id",
  "session_id",
  "coder",
  "link",
  "first_answer",
  "last_change",
  "design_version",
  "device_id",
  "unit_ms_client",
  "unit_ms_server",
] as const;

/** coders.csv: the columns before the session values, the loops' and the questions' (a row per coder session). */
export const CODER_COLUMNS = [
  "session_id",
  "coder",
  "email",
  "link",
  "started",
  "last_active",
  "ended",
  "ended_at",
  "deletion_requested",
  "display",
] as const;

/** coders.csv: the units a coder finished in a loop, by the loop's id (`finished_loop_1`). */
export const finishedColumn = (loopId: string) => `finished_${loopId}`;

/** coders.csv: the test units of a kind (overlap, gold, practice) a coder finished. */
export const testUnitsColumn = (kind: string) => `${kind}_finished`;

/**
 * What a question's extra columns are called, after the question's own
 * column (`q`, a scale's item `q.item`) and a dot: `q.label` (the answer's
 * label), `q.special` (the kind of special answer), `q.comment` (the
 * coder's comment) and `q.json` (an answer with several parts, as JSON).
 * A scale's items can't have these names.
 */
export const DERIVED_COLUMNS = ["label", "special", "comment", "json"] as const;
export type DerivedColumn = (typeof DERIVED_COLUMNS)[number];

/** The name of a question's extra column: `q.label`, `q.item.special`, ... */
export const derivedColumn = (column: string, derived: DerivedColumn) => `${column}.${derived}`;

const SYSTEM_COLUMNS: ReadonlySet<string> = new Set([
  ...ANNOTATION_COLUMNS,
  ...CODER_COLUMNS,
  ...["overlap", "gold", "practice"].map(testUnitsColumn),
]);

/**
 * Whether a question can't have this name because the download has a
 * column of that name (compared without regard to capitals, as statistics
 * programs do): a system column, or a loop's `finished_loop_<n>`.
 */
export function reservedColumnName(name: string): boolean {
  const lower = name.toLowerCase();
  return SYSTEM_COLUMNS.has(lower) || /^finished_loop_\d+$/.test(lower);
}

/** Whether a scale item can't have this name: `q.<item>` would be one of the question's extra columns. */
export function reservedScaleItemName(name: string): boolean {
  return (DERIVED_COLUMNS as readonly string[]).includes(name.toLowerCase());
}
