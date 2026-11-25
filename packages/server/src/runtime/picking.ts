import {
  sharedDefaults,
  DEFAULT_RATE,
  type CoderUnitResponse,
  type ResolvedLoopUnits,
  own,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { Codings, UnitPool, pickNext, type TestUnitPlacement } from "./distribution.js";
import type { Store } from "./store.js";
import type { Coder, Lease, Unit } from "./types.js";
import { type LoopInfo } from "./designItems.js";
import { codingsOf, type Deployed } from "./deployed.js";
import { ownUnits, routeOf, testUnits, type Route } from "./shares.js";
import { assignCondition } from "./experiments.js";
import { coderUnit, getUnits, markServed } from "./coderUnit.js";
import { assertOpen } from "./sessionEnd.js";

// A coder's next units in a loop; in a shared queue picked under its lock, counting every coder.

const PLACEMENTS = { first: "before", last: "after", spread: "spread", rate: "rate" } as const;

/** A route's pools, with the state they were loaded with. */
interface Routed {
  units: ResolvedLoopUnits;
  main: UnitPool;
  /** The test units' pools besides the coder's own units: practice, overlap, gold (in that order of precedence). */
  extras: TestUnitPlacement[];
}

/** One coder's request for units from a loop (`pick`). */
interface PickRequest {
  coder: Coder;
  info: LoopInfo;
  route: Route;
  count: number;
}

export interface PickWaiter {
  request: PickRequest;
  resolve: (units: Unit[]) => void;
  reject: (error: unknown) => void;
}

/** At most this many requests picked in one turn of a shared queue's lock (a turn is one transaction). */
const MAX_PICKS_PER_TURN = 50;

/**
 * The waiting requests for the next turn, in order, taken off `queue`. A
 * coder's second request waits for a later turn: asked again, a coder gets
 * the units they hold, which a turn knows only once it's over.
 */
function takeTurn(queue: PickWaiter[]): PickWaiter[] {
  const turn: PickWaiter[] = [];
  const coders = new Set<number>();
  for (let i = 0; i < queue.length && turn.length < MAX_PICKS_PER_TURN;) {
    const sessionId = queue[i]!.request.coder.sessionId;
    if (coders.has(sessionId)) {
      i++;
      continue;
    }
    coders.add(sessionId);
    turn.push(...queue.splice(i, 1));
  }
  return turn;
}

/** A route's pools, working on these codings and (shared queues) leases. */
function pools(d: Deployed, route: Route, codings: Codings, leases: Lease[]): Routed {
  const { units, share } = route;
  const main = new UnitPool(share.key, ownUnits(d, route), sharedDefaults(units), codings);
  // Every lease of the loop: shares overlap (`a;b`), and a unit leased in one share is taken in all
  main.loadLeases(leases.map((l) => ({ ...l, expires: new Date(l.expires).getTime() })));
  const extras = testUnits(d, route).map((s): TestUnitPlacement => ({
    pool: new UnitPool(s.set, s.units, null, codings),
    placement: PLACEMENTS[s.placement],
    ...(s.placement === "rate" ? { every: s.every ?? DEFAULT_RATE, rest: s.rest ?? "end" } : {}),
  }));
  return { units, main, extras };
}

/**
 * A coder enters a loop: the experiment that selects its units, if the
 * coder hasn't reached it (e.g. it was hidden), is drawn now. Marks the coder as having reached the loop
 * (`coder_sessions.assignments`, for the progress counts). A session without a
 * value it needs (a coder from a link made before `coder_set` had
 * values) gets 409 `not_assigned`.
 */
async function enterLoop(d: Deployed, coder: Coder, info: LoopInfo): Promise<Route> {
  for (const column of d.shareColumns.get(info.key) ?? []) {
    if (column.random && own(coder.session, column.name) === undefined) await assignCondition(d, coder, column.name);
  }
  const route = routeOf(d, coder, info);
  if (!route)
    throw new HttpError(409, "No units are assigned to you yet: ask the researcher for a new link", "not_assigned");
  if (!coder.assignments[info.key]) {
    // Taking an earlier loop's units: the ones this coder finished there, in that order (fixed from now on)
    const sameAs = info.units.sameAs;
    const units =
      sameAs !== undefined
        ? (await d.store.listCodings({ sessionId: coder.sessionId, loop: sameAs })).map((c) => c.unitId)
        : undefined;
    const assignment = { at: d.options.now(), ...(units ? { units } : {}) };
    await d.store.routeCoder(coder.sessionId, info.key, assignment);
    coder.assignments = { ...coder.assignments, [info.key]: assignment };
    // An earlier loop's units are known now
    if (units) return routeOf(d, coder, info)!;
  }
  return route;
}

/**
 * The coder's next `count` units in a loop, in order (a batch: the client
 * asks again before it runs out); none when they are done with it. Units
 * they haven't finished: asked again, the same ones come first. In a
 * shared queue they are picked under the queue's lock, counting every
 * coder's codings and leases, and leased to the coder (a lease they hold
 * already is renewed).
 */
export async function nextUnits(d: Deployed, coder: Coder, loopName: string, count = 1): Promise<CoderUnitResponse[]> {
  assertOpen(d, coder);
  if (!d.spec.active) throw new HttpError(409, "This study is paused", "study_paused");
  const info = d.loops.get(loopName);
  if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
  const route = await enterLoop(d, coder, info);
  const units = route.units.criteria
    ? await pickShared(d, { coder, info, route, count })
    : (await pick(d, d.store, info, [{ coder, info, route, count }]))[0]!;
  return Promise.all(
    units.map(async (unit) => {
      const [shown, answers] = await Promise.all([
        markServed(d, coder.sessionId, unit),
        d.store.unitAnswers(coder.sessionId, unit.id),
      ]);
      return coderUnit(d, route, unit, shown.data, answers);
    }),
  );
}

/**
 * Picks from a shared queue under its lock (one lock for the whole loop,
 * since shares overlap: `a;b`). Requests that arrive while the
 * lock is busy are picked together in its next turn: one read of the
 * codings serves them all, which is what limits a busy queue.
 */
function pickShared(d: Deployed, request: PickRequest): Promise<Unit[]> {
  const key = request.info.key;
  return new Promise((resolve, reject) => {
    const waiting = d.queueWaiting.get(key);
    if (waiting) {
      waiting.push({ request, resolve, reject });
      return;
    }
    const queue: PickWaiter[] = [{ request, resolve, reject }];
    d.queueWaiting.set(key, queue);
    void (async () => {
      while (queue.length > 0) {
        const turn = takeTurn(queue);
        try {
          const picked = await d.store.locked(`queue/${key}`, (store) =>
            pick(
              d,
              store,
              request.info,
              turn.map((w) => w.request),
            ),
          );
          turn.forEach((w, i) => w.resolve(picked[i]!));
        } catch (e) {
          for (const w of turn) w.reject(e);
        }
      }
      d.queueWaiting.delete(key);
    })();
  });
}

/**
 * Picks each request's next units, in turn (and leases them, in a shared
 * queue); skips units that no longer exist. In a shared queue, a request
 * sees the units picked for the requests before it.
 */
async function pick(d: Deployed, store: Store, info: LoopInfo, requests: PickRequest[]): Promise<Unit[][]> {
  const shared = !!requests[0]!.route.units.criteria;
  // A shared queue counts every coder; otherwise only the coder's own codings matter.
  // Leases first: finishing a unit (not under this lock) adds the coding and
  // drops the lease, so a coding finished in between is still seen, as a coding.
  const leases = shared ? await store.listLeases({ loop: info.key }) : [];
  const rows = await store.listCodings(
    shared ? { loop: info.key } : { loop: info.key, sessionId: requests[0]!.coder.sessionId },
  );
  const codings = codingsOf(rows);
  /** The units read so far, for all requests. */
  const units = new Map<number, Unit>();
  const newLeases: Lease[] = [];
  const result: Unit[][] = [];
  for (const request of requests) {
    const routed = pools(d, request.route, codings, leases);
    // Picks ids first, then reads them in one query: a unit deleted since the
    // spec was read is dropped from the pools and another one picked.
    const picked: Picked[] = [];
    for (;;) {
      const wanted = pickIds(d, info, request, routed, codings, request.count - picked.length);
      if (wanted.length === 0) break;
      const unknown = wanted.map((w) => w.unitId).filter((id) => !units.has(id));
      if (unknown.length > 0) for (const [id, unit] of await getUnits(d, unknown, store)) units.set(id, unit);
      picked.push(...wanted.filter((w) => units.has(w.unitId)));
      if (dropMissingUnits(routed, wanted, units) === 0) break;
    }
    const held = leasePicked(d, info, request.coder, picked);
    newLeases.push(...held);
    leases.push(...held);
    result.push(picked.map((p) => units.get(p.unitId)!));
  }
  await store.putLeases(newLeases, new Date(d.options.now()));
  return result;
}

/** A picked unit, and the pool it came from. */
interface Picked {
  unitId: number;
  pool: UnitPool;
}

/** The coder's next `count` unit ids from a route's pools (fewer when they run out), taken from the pools. */
function pickIds(
  d: Deployed,
  info: LoopInfo,
  { coder, route }: PickRequest,
  { main, extras }: Routed,
  codings: Codings,
  count: number,
): Picked[] {
  const wanted: Picked[] = [];
  while (wanted.length < count) {
    const now = d.options.now();
    const next = pickNext(main, extras, coder.sessionId, codings, {
      order: info.loop.order ?? "sequential",
      maxUnits: route.units.criteria?.unitsPerCoder?.max,
      minUnits: route.units.criteria?.unitsPerCoder?.min,
      seed: d.spec.studyId * 1000,
      now,
    });
    if (!next) break;
    if (next.pool.rule) next.pool.take(coder.sessionId, next.unitId, now);
    // As if finished, for the rest of this turn: the next pick moves on (and counts it for
    // `maxUnits` and the overlap's place), and so do the next requests' picks.
    codings.record(coder.sessionId, next.unitId, {});
    wanted.push(next);
  }
  return wanted;
}

/** Takes the picked units that don't exist any more (not among `units`) out of the pools; returns how many. */
function dropMissingUnits({ main, extras }: Routed, wanted: Picked[], units: Map<number, Unit>): number {
  const missing = wanted.filter((w) => !units.has(w.unitId));
  for (const { unitId } of missing) {
    main.removeUnit(unitId);
    for (const extra of extras) extra.pool.removeUnit(unitId);
  }
  return missing.length;
}

/** The leases on the units picked from a shared queue (none for the coder's own units). */
function leasePicked(d: Deployed, info: LoopInfo, coder: Coder, picked: Picked[]): Lease[] {
  const now = d.options.now();
  return picked.flatMap(({ pool, unitId }) =>
    pool.rule
      ? [
          {
            loop: info.key,
            set: pool.set,
            sessionId: coder.sessionId,
            unitId,
            expires: new Date(now + pool.rule.leaseSeconds * 1000),
          },
        ]
      : [],
  );
}
