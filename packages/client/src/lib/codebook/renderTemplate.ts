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
 */
export async function renderTemplate(template: string, values: Record<string, unknown>): Promise<string> {
  const matches = [...template.matchAll(/\{\{([\s\S]+?)\}\}/g)];
  if (matches.length === 0) return template;

  const results = await Promise.all(matches.map((m) => evaluateExpression(m[1].trim(), values)));

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
