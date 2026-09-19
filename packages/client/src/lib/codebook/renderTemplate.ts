import type { ExpressionCache } from "./expressionCache";
import { evaluateExpression } from "./expression";

/**
 * Resolves a unit_loop layout's `{{ expression }}` interpolation (design
 * plan §11f) and `$unit.field` references:
 * - Inside `{{ ... }}`: evaluated in QuickJS sandbox against `values`
 *   (which includes `$unit` pointing to unit data columns, constants, etc.).
 * - Standalone `$unit.fieldName` in template text (outside directives) is
 *   substituted with the unit data value.
 */
export async function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  cache?: ExpressionCache,
  keyPrefix = "template",
): Promise<string> {
  const matches = [...template.matchAll(/\{\{([\s\S]+?)\}\}/g)];
  let rendered = template;

  if (matches.length > 0) {
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
    rendered = result;
  }

  // Replace standalone $unit.fieldName outside directives (e.g. not inside ::field[...] or ::tokenize[...])
  const unitData = (values.$unit as Record<string, unknown> | undefined) ?? values;
  rendered = rendered.replace(/(?<!::(?:field|tokenize)\[)\$unit\.([A-Za-z0-9_]+)/g, (match, fieldName) => {
    if (unitData && typeof unitData === "object" && fieldName in unitData) {
      const val = (unitData as Record<string, unknown>)[fieldName];
      return val === undefined ? "" : String(val);
    }
    return match;
  });

  return rendered;
}
