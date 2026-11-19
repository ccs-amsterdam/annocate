import { sessionColumns, sessionItem } from "./session.js";

// Who gets which units (docs/plans/unit-assignment.md): a session's units
// are those whose cells hold its values, in every set column a value is
// linked to (its share). The coder (`session.coders`) and assigned
// conditions with `units` hold for every loop; a random condition with
// `units` for the loops after it in the flow.

/** A session value that selects units: `name` (in `$session`, or a random condition) and its set column. */
export interface ShareColumn {
  name: string;
  column: string;
  /** A computed item (a random value), drawn when reached: else a session value. */
  random?: boolean;
}

/**
 * Per loop (by key, as `unitLoops`), the session values that select its
 * units: the session's columns, and the random conditions linked to a
 * column that come before the loop (in the order of the flow).
 */
export function loopShareColumns(items: readonly unknown[]): Map<string, ShareColumn[]> {
  const base: ShareColumn[] = sessionColumns(sessionItem(items));
  const random: ShareColumn[] = [];
  const out = new Map<string, ShareColumn[]>();
  let loops = 0;
  const walk = (list: unknown) => {
    for (const raw of Array.isArray(list) ? list : []) {
      const it = raw as { type?: unknown; name?: unknown; variable?: { type?: unknown; units?: unknown }; children?: unknown } | null;
      if (!it || typeof it !== "object") continue;
      if (it.type === "unit_loop") {
        loops++;
        out.set(String(loops), [...base, ...random]);
        continue;
      }
      if (it.type === "computed" && it.variable?.type === "random" && typeof it.variable.units === "string" && typeof it.name === "string") {
        if (!random.some((r) => r.name === it.name)) random.push({ name: it.name, column: it.variable.units, random: true });
      }
      if (it.type === "show_if") walk(it.children);
    }
  };
  walk(items);
  return out;
}
