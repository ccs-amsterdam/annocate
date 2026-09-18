import type { ExpressionCache } from "./expressionCache";
import { evaluateExpression } from "./expression";

/**
 * Resolves a unit_loop layout's `{{ expression }}` interpolation (design
 * plan §11f): each `{{ ... }}` block is a JS expression, evaluated in the
 * same QuickJS sandbox as `condition` items (`expression.ts`) against
 * `values` (typically unit data columns + this layout's `constants` +
 * known variable values -- see `JobManager`'s `resolveUnitLayout`), and the
 * (String-coerced) result is substituted in place.
 *
 * Upgraded from a dumb `{{column}}` regex substitution (Phase 4.2) to full
 * expression evaluation specifically to support conditional content, e.g.
 * `{{is_experiment ? experiment_intro : control_intro}}` combining a
 * variable value with layout `constants` (design plan §11f, 2026-09-18).
 * Intentionally does NOT touch `::field`/`::tokenize` directive syntax --
 * those are handled separately by `UnitFields.tsx`/`unitFieldDirective.ts`
 * so that directive-referenced text stays exactly equal to its raw source
 * (a data column or layout constant), never passing through this function.
 *
 * `cache` + `keyPrefix` (design plan §12, optional): when supplied, each
 * `{{...}}` block is treated as its own memoized "slot" (keyed by
 * `${keyPrefix}:${blockIndex}`) via the shared `ExpressionCache` -- reusing
 * the last result whenever that block's actually-referenced values haven't
 * changed, instead of always re-running QuickJS. Safe to key purely by
 * block index because a given unit_loop's `template` string (and therefore
 * its `{{...}}` block order) never changes between calls; only `values`
 * does, which is exactly what invalidates the cache when it should.
 */
export async function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  cache?: ExpressionCache,
  keyPrefix = "template",
): Promise<string> {
  const matches = [...template.matchAll(/\{\{([\s\S]+?)\}\}/g)];
  if (matches.length === 0) return template;

  const results = await Promise.all(
    matches.map((m, i) => {
      const expression = m[1].trim();
      return cache ? cache.evaluate(`${keyPrefix}:${i}`, expression, values) : evaluateExpression(expression, values);
    }),
  );

  let result = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    result += template.slice(cursor, match.index);
    const value = results[i];
    result += value === undefined ? "" : String(value);
    cursor = match.index + match[0].length;
  });
  result += template.slice(cursor);
  return result;
}
