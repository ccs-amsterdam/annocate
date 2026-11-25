import { loopTitle, type DeploymentStatus } from "@annotinder/contracts";
import { UnitPool } from "./distribution.js";
import { codingsOf, type Deployed } from "./deployed.js";
import { poolUnits, routeOf } from "./shares.js";

// A study's progress, for its researchers.

/** Progress per loop and set: from every coder's codings, routing and leases. */
export async function deploymentStatus(d: Deployed): Promise<DeploymentStatus> {
  const now = d.options.now();
  const [rows, allCoders, leases] = await Promise.all([
    d.store.listCodings({}),
    d.store.listCoders(),
    d.store.listLeases({}),
  ]);
  const sources: DeploymentStatus["sources"] = [];
  for (const [loop, info] of d.loops) {
    const codings = codingsOf(rows.filter((r) => r.loop === loop));
    const routes = allCoders.flatMap((c) => {
      const route = c.assignments[loop] ? routeOf(d, c, info) : null;
      return route ? [{ sessionId: c.sessionId, route }] : [];
    });
    // One row per pool: a set with its rule (a shared queue, or handed out whole). The previous loop's units are
    // each coder's own: one row for all of them
    const found = new Map<
      string,
      { set: string; rule: UnitPool["rule"]; unitIds: Set<number>; shares: Set<string>; coders: number[] }
    >();
    for (const { sessionId, route } of routes) {
      for (const pool of poolUnits(d, route)) {
        const set = pool.set.replace(/^session \d+ as /, "as ");
        const key = `${set}/${JSON.stringify(pool.rule)}`;
        if (!found.has(key))
          found.set(key, { set, rule: pool.rule, unitIds: new Set(), shares: new Set(), coders: [] });
        const row = found.get(key)!;
        row.coders.push(sessionId);
        // Coders with the same share have the same units: added once, not per coder
        if (row.shares.has(pool.set)) continue;
        row.shares.add(pool.set);
        for (const id of pool.unitIds) row.unitIds.add(id);
      }
    }
    const loopLeases = leases
      .filter((l) => l.loop === loop)
      .map((l) => ({ ...l, expires: new Date(l.expires).getTime() }));
    // Shares overlap (`a;b`, test units): a unit is listed once, in the first row that has it
    const listed = new Set<number>();
    const pools: { pool: UnitPool; coders: number[] }[] = [];
    for (const { set, rule, unitIds, coders } of found.values()) {
      const pool = new UnitPool(
        set,
        [...unitIds].filter((id) => !listed.has(id)),
        rule,
        codings,
      );
      pool.loadLeases(loopLeases);
      for (const id of pool.unitIds) listed.add(id);
      pools.push({ pool, coders });
    }
    for (const { pool, coders } of pools) {
      sources.push({
        loop,
        title: loopTitle(info.loop),
        set: pool.set,
        ...pool.status(now, coders),
        coders: coders.length,
      });
    }
  }
  return {
    deploymentId: d.id,
    version: d.spec.version,
    active: d.spec.active,
    coders: allCoders.length,
    sources,
  };
}
