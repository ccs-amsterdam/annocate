import { CODER_SET, CONDITION_SET } from "../sets.js";
import { inviteOf, sessionItem } from "./session.js";
import { forEachItem, loopKey } from "./walk.js";

// Who gets which units (docs/architecture.md §6, docs/plans/unit-sets.md):
// a session's units are those whose cells hold its values, in every set
// column a value is linked to (its share). The coder (expert coders,
// `coder_set`) holds for every loop; the condition of the experiment that
// selects units (`condition_set`) for the loops after it in the flow.

/** A value that selects units: `name` (`$session.coder`, or an experiment's condition) and its set column. */
export interface ShareColumn {
  name: string;
  column: string;
  /** An experiment's condition, assigned when reached; else a session value. */
  random?: boolean;
}

/** Whether an item is an experiment that selects units (`units: true`). */
export function selectsUnits(item: unknown): item is { type: "experiment"; name: string } {
  const it = item as { type?: unknown; name?: unknown; variable?: { type?: unknown; units?: unknown } } | null;
  return (
    it?.type === "experiment" &&
    typeof it.name === "string" &&
    it.variable?.type === "random" &&
    it.variable.units === true
  );
}

/**
 * Per loop (by key, as `unitLoops`), the session values that select its
 * units: the coder (expert coders), and the experiment that selects
 * units if it comes before the loop (in the order of the flow).
 */
export function loopShareColumns(items: readonly unknown[]): Map<string, ShareColumn[]> {
  const sessionShares: ShareColumn[] =
    inviteOf(sessionItem(items))?.mode === "coders" ? [{ name: "coder", column: CODER_SET }] : [];
  const randomShares: ShareColumn[] = [];
  const out = new Map<string, ShareColumn[]>();
  forEachItem<{ type?: unknown; name?: unknown; id?: unknown }>(items, (it) => {
    if (it.type === "unit_loop") out.set(loopKey(it), [...sessionShares, ...randomShares]);
    else if (selectsUnits(it) && !randomShares.some((r) => r.name === it.name))
      randomShares.push({ name: it.name, column: CONDITION_SET, random: true });
    if (it.type !== "branch") return "skip";
  });
  return out;
}
