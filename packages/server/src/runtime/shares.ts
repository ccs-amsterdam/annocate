import {
  ALL_UNITS_SET,
  PART_SET,
  TEST_SET,
  setKey,
  sharedDefaults,
  type TestSetType,
  type ResolvedLoopUnits,
  own,
} from "@annotinder/contracts";
import { UnitPool } from "./distribution.js";
import type { Coder } from "./types.js";
import { type LoopInfo } from "./designItems.js";
import { type Deployed } from "./deployed.js";

// Which units are a coder's in a loop (docs/architecture.md §6): pure lookups in the deployed sets.

/**
 * A coder's units in a loop (docs/architecture.md §6,
 * docs/plans/unit-sets.md): those whose cells hold the session's values in
 * every set column a value is linked to (the coder's `coder_set`, the
 * condition's `condition_set`), within the loop's part (`part_set`); or for
 * a loop taking an earlier loop's units, the units the coder finished
 * there. Shared by every coder with the same values: `key` names it (the
 * pool of a shared queue, its leases, a row of the status). The test units
 * (`test_set`) come apart, for everyone: overlap, practice and gold (those
 * with a part only in that part's loops).
 */
export interface Share {
  key: string;
  own: number[];
  overlap: number[];
  practice: number[];
  gold: number[];
  /** An earlier loop's units, before the coder reached this loop: not known yet. */
  pending?: boolean;
}

/** A coder's units in a loop: the loop's settings, and their share. */
export interface Route {
  units: ResolvedLoopUnits;
  share: Share;
}

/** The test units a loop can mix in, in order of precedence when several are due. */
const TEST_UNITS = [
  { set: "practice", units: (s: Share) => s.practice, settings: (u: ResolvedLoopUnits) => u.practice },
  {
    set: "overlap",
    units: (s: Share) => s.overlap,
    settings: (u: ResolvedLoopUnits) => (u.overlap?.placement === "disabled" ? undefined : u.overlap),
  },
  { set: "gold", units: (s: Share) => s.gold, settings: (u: ResolvedLoopUnits) => u.gold },
] as const;

/** A set's units, as of the spec. */
function unitsOf(d: Deployed, set: string): number[] {
  return d.sets.get(set) ?? [];
}

/**
 * The share of a coder in a loop: from their session values (the coder,
 * an experiment's condition that selects units), or null while one of
 * them has no value (an experiment not reached yet, a coder without a
 * coder value). Cached by key, until the sets change (not an earlier
 * loop's units: those are the coder's own).
 */
function shareOf(d: Deployed, coder: Coder, loop: string, settings: ResolvedLoopUnits): Share | null {
  const columns = d.shareColumns.get(loop) ?? [];
  const values: [string, string][] = [];
  for (const c of columns) {
    const value = own(coder.session, c.name);
    if (value === undefined) return null;
    values.push([c.column, value]);
  }
  const { part, sameAs } = settings;
  // An earlier loop's units: the coder's own (fixed when they reach this loop, `enterLoop`), not cached
  const earlier = sameAs !== undefined ? coder.assignments[loop]?.units : undefined;
  // Everything the units depend on: the values, the part, and the overlap's settings (its count, how it's picked)
  const key =
    (sameAs !== undefined
      ? `session ${coder.sessionId} as ${sameAs}`
      : values.map(([column, value]) => `${column}=${value}`).join(",") || "all") +
    (part !== undefined ? ` | part ${part}` : "") +
    (settings.overlap && !["spread", "rate"].includes(settings.overlap.placement)
      ? ` | overlap ${settings.overlap.placement}`
      : "");
  const cached = sameAs === undefined ? d.shares.get(key) : undefined;
  if (cached) return cached;

  // The loop's part: its units; test units without a part are in every part
  const inPart = new Set(part !== undefined ? unitsOf(d, setKey(PART_SET, part)) : []);
  const withPart = new Set(
    part !== undefined ? (d.groups.get(PART_SET) ?? []).flatMap((p) => unitsOf(d, setKey(PART_SET, p))) : [],
  );
  const tests = (type: string) =>
    unitsOf(d, setKey(TEST_SET, type)).filter((id) => part === undefined || inPart.has(id) || !withPart.has(id));
  const testUnits = new Set((d.groups.get(TEST_SET) ?? []).flatMap((type) => unitsOf(d, setKey(TEST_SET, type))));
  let units: number[];
  if (sameAs !== undefined) units = earlier ?? [];
  else if (values.length === 0) units = unitsOf(d, ALL_UNITS_SET);
  else {
    // In every column: the value's units
    const [first, ...rest] = values.map(([column, value]) => unitsOf(d, setKey(column, value)));
    const others = rest.map((list) => new Set(list));
    units = [...new Set(first)].filter((id) => others.every((o) => o.has(id)));
  }
  if (part !== undefined) units = units.filter((id) => inPart.has(id));
  const overlap = tests("overlap");
  const share: Share = {
    key,
    own: units.filter((id) => !testUnits.has(id)),
    // Taking an earlier loop's units: the overlap units among them
    overlap: sameAs !== undefined ? units.filter((id) => overlap.includes(id)) : overlap,
    practice: tests("practice"),
    gold: tests("gold"),
    ...(sameAs !== undefined && earlier === undefined ? { pending: true } : {}),
  };
  if (sameAs === undefined) d.shares.set(key, share);
  return share;
}

/**
 * A route's test units (docs/architecture.md §6.2): its practice,
 * overlap and gold units, for those the loop places.
 */
export function testUnits(
  d: Deployed,
  route: Route,
): {
  set: string;
  type: TestSetType;
  units: number[];
  placement: "first" | "last" | "spread" | "rate";
  every?: number;
  rest?: "end" | "drop";
}[] {
  return TEST_UNITS.flatMap(({ set, units, settings }) => {
    const s = settings(route.units);
    if (!s || s.placement === "disabled") return [];
    const list = units(route.share);
    return list.length > 0
      ? [
          {
            set: `${route.share.key}/${set}`,
            type: set,
            units: list,
            placement: s.placement,
            every: s.every,
            rest: s.rest,
          },
        ]
      : [];
  });
}

/** The units of one test unit type of a route (empty if it doesn't place it). */
export function testUnitsOf(d: Deployed, route: Route, set: string): number[] {
  return testUnits(d, route).find((s) => s.set === `${route.share.key}/${set}`)?.units ?? [];
}

/** The coder's own units of a route, without the test units. */
export function ownUnits(d: Deployed, route: Route): number[] {
  return route.units.own ? route.share.own : [];
}

/** All units of a route (own and test units). */
export function routeUnits(d: Deployed, route: Route | null): Set<number> {
  return new Set(route ? [...ownUnits(d, route), ...testUnits(d, route).flatMap((s) => s.units)] : []);
}

/** How many units the coder will get in a loop, if that doesn't depend on other coders. */
export function expectedUnits(d: Deployed, route: Route | null): number | null {
  if (!route || route.share.pending) return null;
  const { criteria } = route.units;
  const size = ownUnits(d, route).length;
  const max = criteria?.unitsPerCoder?.max;
  const count = criteria ? (max === undefined ? null : Math.min(max, size)) : size;
  return count === null ? null : count + testUnits(d, route).reduce((n, s) => n + s.units.length, 0);
}

/** What a route's pools hold (`pools`), without building them: the coder's own units first, then the test units. */
export function poolUnits(d: Deployed, route: Route): { set: string; rule: UnitPool["rule"]; unitIds: number[] }[] {
  return [
    { set: route.share.key, rule: sharedDefaults(route.units), unitIds: ownUnits(d, route) },
    ...testUnits(d, route).map((s) => ({ set: s.set, rule: null, unitIds: s.units })),
  ];
}

/**
 * A coder's units in a loop: their share, from their session values (null
 * while one of them has no value). Nothing is stored for this: a coder's
 * units follow from the session (docs/architecture.md §6), and the
 * units a coder coded stay theirs (`loopUnit`, `submitUnit`).
 */
export function routeOf(d: Deployed, coder: Coder, info: LoopInfo): Route | null {
  const units = info.units;
  const share = shareOf(d, coder, info.key, units);
  return share ? { units, share } : null;
}
