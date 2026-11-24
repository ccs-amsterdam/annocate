import type { UnitSet } from "@annotinder/contracts";

// Changing who codes which units in the coder set (the Units page's coders
// dialog). A coder keeps the units they coded; of the rest, the units they
// were never sent go first (a unit they were sent may be on their screen),
// from the end of their list. Units no coder has (and that aren't test
// units) are unassigned: coders take theirs from those.

/** Per coder: the units they coded, and the ones they were sent but didn't code (contracts `CoderUnits`). */
export type CoderWork = Map<string, { coded: Set<number>; served: Set<number> }>;

/** A coder's units in the coder set, coded or still to code. */
export interface CoderCount {
  coder: string;
  units: number;
  coded: number;
  toCode: number;
}

export function coderCounts(sets: readonly UnitSet[], work: CoderWork): CoderCount[] {
  return sets.map((s) => {
    const coded = s.unitIds.filter((id) => work.get(s.name)?.coded.has(id)).length;
    return { coder: s.name, units: s.unitIds.length, coded, toCode: s.unitIds.length - coded };
  });
}

/** The units `from` can give away, the first to move first: never sent before sent, last in their list first. */
function movable(set: UnitSet, work: CoderWork): number[] {
  const own = work.get(set.name);
  const open = set.unitIds.filter((id) => !own?.coded.has(id)).reverse();
  return [...open.filter((id) => !own?.served.has(id)), ...open.filter((id) => own?.served.has(id))];
}

/** Whether `coder` can take the unit: they don't have it yet (several coders can share a unit). */
const canTake = (set: UnitSet, id: number) => !set.unitIds.includes(id);

/** The units no coder has: every unit but the test units and the coders' (in the order given). */
export function unassignedUnits(all: readonly number[], sets: readonly UnitSet[], tests: readonly number[]): number[] {
  const taken = new Set([...tests, ...sets.flatMap((s) => s.unitIds)]);
  return all.filter((id) => !taken.has(id));
}

/**
 * Gives a coder `target` units to code: fewer drops units they haven't
 * coded (they become unassigned, unless another coder has them too); more
 * takes units from `unassigned`, as many as there are. Returns the sets.
 */
export function setToCode(
  sets: readonly UnitSet[],
  coder: string,
  target: number,
  work: CoderWork,
  unassigned: readonly number[],
): UnitSet[] {
  const set = sets.find((s) => s.name === coder);
  if (!set) return [...sets];
  const current = coderCounts([set], work)[0].toCode;
  const goal = Math.max(0, Math.round(target));
  let unitIds = set.unitIds;
  if (goal < current) {
    const dropping = new Set(movable(set, work).slice(0, current - goal));
    unitIds = unitIds.filter((id) => !dropping.has(id));
  } else if (goal > current) {
    unitIds = [...unitIds, ...unassigned.filter((id) => canTake(set, id)).slice(0, goal - current)];
  }
  return sets.map((s) => (s.name === coder ? { ...s, unitIds } : s));
}

/** Renames a coder in the coder set. */
export function renameCoder(sets: readonly UnitSet[], from: string, to: string): UnitSet[] {
  return sets.map((s) => (s.name === from ? { ...s, name: to } : s));
}

/**
 * Hands out all of `from`'s units they haven't coded to the other coders,
 * one at a time to whoever has the fewest left to code (and doesn't have the
 * unit yet). `from` keeps the units they coded; without any, they leave the
 * coder set. Units nobody can take stay with `from`.
 */
export function spreadUnits(
  sets: readonly UnitSet[],
  from: string,
  work: CoderWork,
): { sets: UnitSet[]; moved: number } {
  const source = sets.find((s) => s.name === from);
  const others = sets.filter((s) => s.name !== from).map((s) => ({ ...s, unitIds: [...s.unitIds] }));
  if (!source) return { sets: [...sets], moved: 0 };
  const left = new Map(others.map((s) => [s.name, coderCounts([s], work)[0].toCode]));
  const kept: number[] = [];
  for (const id of movable(source, work)) {
    const takers = others.filter((s) => canTake(s, id));
    if (takers.length === 0) {
      kept.push(id);
      continue;
    }
    const taker = takers.reduce((a, b) => (left.get(b.name)! < left.get(a.name)! ? b : a));
    taker.unitIds.push(id);
    left.set(taker.name, left.get(taker.name)! + 1);
  }
  const coded = source.unitIds.filter((id) => work.get(from)?.coded.has(id));
  const remaining = source.unitIds.filter((id) => coded.includes(id) || kept.includes(id));
  const moved = source.unitIds.length - remaining.length;
  return {
    sets: sets.flatMap((s) =>
      s.name === from
        ? remaining.length > 0
          ? [{ ...s, unitIds: remaining }]
          : []
        : [others.find((o) => o.name === s.name)!],
    ),
    moved,
  };
}
