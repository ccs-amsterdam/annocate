import { evaluateExpression } from "./expression";

/**
 * Evaluates a codebook `condition` item's expression (design plan §2/§11)
 * against a map of currently-known variable values (name -> the value the
 * coder picked, e.g. a code string), coercing the result to a boolean.
 *
 * A thin wrapper around the shared QuickJS-sandboxed `evaluateExpression`
 * (see `expression.ts` for the sandbox choice's full history/rationale) --
 * `renderTemplate.ts`'s `{{ expression }}` interpolation (§11f) uses the
 * same sandbox via the same function.
 */
export async function evaluateCondition(expression: string, values: Record<string, unknown>): Promise<boolean> {
  return Boolean(await evaluateExpression(expression, values));
}
