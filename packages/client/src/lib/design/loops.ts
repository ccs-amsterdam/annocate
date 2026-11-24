import { loopIds, loopTitle, nextLoopId, unitLoops, type CoderProgress } from "@annotinder/contracts";

// Unit loops in the editor: the id a new loop gets, and what deleting a
// loop that coders worked in means. A loop's id (loop_1, loop_2, …) is how
// results, exports and the API refer to it in every version of the design:
// it is never changed, and never given to another loop.

/** Adds the ids of these designs' loops to the ids the editor has seen. */
export function rememberLoopIds(seen: Set<string>, designs: readonly (readonly unknown[])[]): void {
  for (const items of designs) for (const id of loopIds(items)) seen.add(id);
}

/**
 * The id for a new loop: the next number not used by any loop the editor
 * knows of. `seen` holds the ids it has come across (also of loops deleted
 * since) and gets the new id; `designs`: the draft, the draft as saved and
 * the deployed design.
 */
export function newLoopId(seen: Set<string>, designs: readonly (readonly unknown[])[]): string {
  rememberLoopIds(seen, designs);
  const id = nextLoopId(seen);
  seen.add(id);
  return id;
}

/** Unit loop id -> the units coders finished in it, all coders together. */
export function finishedPerLoop(coders: readonly Pick<CoderProgress, "finished">[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const coder of coders) {
    for (const { loop, units } of coder.finished) total.set(loop, (total.get(loop) ?? 0) + units);
  }
  return total;
}

/**
 * What to tell the researcher before unit loops that coders worked in are
 * deleted (null: none of the deleted loops has finished units). The server
 * warns about the same when the design is deployed.
 */
export function deletedLoopWarning(
  before: readonly unknown[],
  after: readonly unknown[],
  loopProgress: ReadonlyMap<string, number> = new Map(),
): string | null {
  const kept = new Set(loopIds(after));
  const deleted = unitLoops(before).filter(({ key }) => !kept.has(key) && (loopProgress.get(key) ?? 0) > 0);
  if (deleted.length === 0) return null;
  const lines = deleted.map(({ key, loop }) => {
    const title = loopTitle(loop);
    return `${title === key ? key : `${title} (${key})`}: coders finished ${loopProgress.get(key)} unit codings in it`;
  });
  return (
    `Coders already worked in ${deleted.length === 1 ? "this unit loop" : "these unit loops"}:\n${lines.join("\n")}\n` +
    "Once this design is deployed, coders no longer get the loop (their answers are kept)."
  );
}
