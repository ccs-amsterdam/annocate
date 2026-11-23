import { sessionColumns, sessionItem } from "./session.js";
import { forEachItem } from "./walk.js";

// Who gets which units (docs/architecture.md §6): a session's units
// are those whose cells hold its values, in every set column a value is
// linked to (its share). The coder (specific coders' column) holds for
// every loop; a random condition with `units` for the loops after it in
// the flow.

/** A value that selects units: `name` (`$session.coder`, or a random condition) and its set column. */
export interface ShareColumn {
  name: string;
  column: string;
  /** A random condition, drawn when reached; else a session value. */
  random?: boolean;
  /** A session value a session may lack (a crowd link without a set): then the column doesn't select its units. */
  optional?: boolean;
}

/**
 * Per loop (by key, as `unitLoops`), the session values that select its
 * units: the session's columns, and the random conditions linked to a
 * column that come before the loop (in the order of the flow).
 */
export function loopShareColumns(items: readonly unknown[]): Map<string, ShareColumn[]> {
  const sessionShares: ShareColumn[] = sessionColumns(sessionItem(items));
  const randomShares: ShareColumn[] = [];
  const out = new Map<string, ShareColumn[]>();
  let loops = 0;
  forEachItem<{ type?: unknown; name?: unknown; variable?: { type?: unknown; units?: unknown } }>(items, (it) => {
    if (it.type === "unit_loop") {
      loops++;
      out.set(String(loops), [...sessionShares, ...randomShares]);
    } else if (
      it.type === "computed" &&
      it.variable?.type === "random" &&
      typeof it.variable.units === "string" &&
      typeof it.name === "string"
    ) {
      if (!randomShares.some((r) => r.name === it.name))
        randomShares.push({ name: it.name, column: it.variable.units, random: true });
    }
    if (it.type !== "block") return "skip";
  });
  return out;
}
