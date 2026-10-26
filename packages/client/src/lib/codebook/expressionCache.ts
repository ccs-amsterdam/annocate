import type { ReferenceScope } from "@annotinder/contracts";
import { extractDependencies } from "./dependencies";
import { evaluateScript } from "./expression";

interface CacheEntry {
  script: string;
  deps: string;
  result: unknown;
}

/**
 * Per-slot memoized script evaluation (docs/client.md §6): a generic
 * "recompute pass + per-slot memoization" utility, instead of a
 * hand-maintained "variable X changing should re-run computation Y, Z"
 * trigger graph that drifts out of sync with the scripts.
 *
 * Each `evaluate` call is a "slot" (a condition, or one expression in a
 * template) identified by a caller-supplied stable `key`. Its dependencies
 * are the values at the references in its source (`dependencies.ts`), so
 * there's no separate dependency list to fall out of sync. If the slot was
 * evaluated before with the same script and equal dependency values, the
 * cached result is reused without invoking QuickJS again.
 *
 * One instance is owned per `JobManager` (i.e. per coder session) and
 * shared across condition evaluation (`tree.ts`) and template rendering
 * (`renderTemplate.ts`). Invalidates itself across units/steps: a template
 * expression using a unit field simply misses once the next unit's value
 * differs.
 */
export class ExpressionCache {
  private cache = new Map<string, CacheEntry>();

  async evaluate(key: string, script: string, scope: ReferenceScope): Promise<unknown> {
    const depValues = extractDependencies(script, scope);
    if (depValues === null) return evaluateScript(script, scope);
    const deps = JSON.stringify(depValues);

    const cached = this.cache.get(key);
    if (cached && cached.script === script && cached.deps === deps) return cached.result;

    const result = await evaluateScript(script, scope);
    this.cache.set(key, { script, deps, result });
    return result;
  }
}
