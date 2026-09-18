import { extractDependencies } from "./dependencies";
import { evaluateExpression } from "./expression";

interface CacheEntry {
  deps: Record<string, unknown>;
  result: unknown;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.is(a[k], b[k]));
}

/**
 * Per-slot memoized QuickJS expression evaluation (design plan §12): a
 * generic "recompute pass + per-slot memoization" utility, replacing the old
 * app's hand-maintained "variable X changing should re-run computation Y, Z"
 * trigger graph (flagged 2026-09-18 as bookkeeping that drifts out of sync
 * with actual script content over time).
 *
 * Each `evaluate` call is a "slot" (a `condition` item's expression, or one
 * `{{...}}` block in a unit_loop layout template) identified by a
 * caller-supplied stable `key`. Dependencies are extracted (conservatively,
 * see `dependencies.ts`) from the expression's own source text against the
 * full set of currently-known value names -- not hand-declared -- so
 * there's no separate dependency list to fall out of sync. On each call, if
 * the slot was evaluated before AND every one of its declared dependencies'
 * current values are `Object.is`-equal to what they were last time, the
 * cached result is reused without invoking QuickJS again; otherwise the
 * expression is (re-)evaluated and the cache entry updated.
 *
 * One instance is owned per `JobManager` (i.e. per coder session) and
 * shared across both condition evaluation (`tree.ts`) and unit-layout
 * template interpolation (`renderTemplate.ts`) -- see their `cache?`
 * parameters. Naturally invalidates itself across units/steps: e.g. a
 * template block referencing a per-unit data column simply gets a cache
 * miss once that column's value differs for the next unit, with no manual
 * "clear on unit change" bookkeeping required.
 */
export class ExpressionCache {
  private cache = new Map<string, CacheEntry>();

  async evaluate(key: string, expression: string, values: Record<string, unknown>): Promise<unknown> {
    const depNames = extractDependencies(expression, Object.keys(values));
    const deps: Record<string, unknown> = {};
    for (const name of depNames) deps[name] = values[name];

    const cached = this.cache.get(key);
    if (cached && shallowEqual(cached.deps, deps)) return cached.result;

    const result = await evaluateExpression(expression, values);
    this.cache.set(key, { deps, result });
    return result;
  }
}
